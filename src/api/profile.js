import { createAccountAuthClient, supabase } from "../lib/supabase";
import { assertAccountAccess } from "../utils/demoMode";
import {
  createUpdatedProfileMetadata,
  assertAuthenticatedUser,
  getDisplayName,
  getLoginUsername,
  getProfileRecoveryEmail,
} from "../utils/accountIdentity";

const freeAutofillDailyLimit = 10;
const subscriberAutofillDailyLimit = 1000;

function isMissingTableError(error) {
  const message = error?.message?.toLowerCase?.() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export { getDisplayName, getLoginUsername, getProfileRecoveryEmail };

export function getAutofillLimit(subscriptionTier) {
  return subscriptionTier === "subscriber"
    ? subscriberAutofillDailyLimit
    : freeAutofillDailyLimit;
}

async function withAccountAuth(userId, isCurrentAccount, operation) {
  assertAccountAccess();
  if (!userId || !isCurrentAccount?.()) throw new Error("The account changed. Reopen Settings before saving.");
  const { data, error } = await supabase.auth.getSession();
  assertAuthenticatedUser({ data: { user: data.session?.user }, error }, userId);
  const client = createAccountAuthClient(isCurrentAccount);
  try {
    const result = await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    return await operation(client, assertAuthenticatedUser(result, userId));
  } finally {
    await client.auth.dispose();
  }
}

export async function updateUserProfile({ displayName, recoveryEmail, userId, isCurrentAccount }) {
  return withAccountAuth(userId, isCurrentAccount, async (client, user) => {
    const { data, error } = await client.auth.updateUser({
      data: createUpdatedProfileMetadata(user, { displayName, recoveryEmail }),
    });
    if (error) throw error;
    return data.user;
  });
}

export async function changeUserPassword({ newPassword, oldPassword, userId, isCurrentAccount }) {
  return withAccountAuth(userId, isCurrentAccount, async (client, user) => {
    if (!user?.email) throw new Error("Could not validate this account.");
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });
    if (signInError) throw new Error("Current password is incorrect.");
    if (signInData.user?.id !== user.id) throw new Error("Could not validate this account.");
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data.user;
  });
}

export async function getAutofillUsageStatus(userId) {
  const date = getTodayKey();
  let subscriptionTier = "free";
  let used = 0;

  const { data: role, error: roleError } = await supabase
    .from("user_subscription_roles")
    .select("subscription_tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleError && !isMissingTableError(roleError)) {
    throw roleError;
  }

  if (role?.subscription_tier === "subscriber") {
    subscriptionTier = "subscriber";
  }

  const { data: usage, error: usageError } = await supabase
    .from("ai_autofill_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (usageError && !isMissingTableError(usageError)) {
    throw usageError;
  }

  used = Number(usage?.request_count ?? 0);
  const limit = getAutofillLimit(subscriptionTier);

  return {
    date,
    limit,
    remaining: Math.max(0, limit - used),
    subscriptionTier,
    used,
  };
}
