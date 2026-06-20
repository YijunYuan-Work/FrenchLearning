import { supabase } from "../lib/supabase";

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

export function getProfileUsername(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "Learner"
  );
}

export function getProfileRecoveryEmail(user) {
  const metadata = user?.user_metadata ?? {};
  const email = String(metadata.profileEmail || metadata.recoveryEmail || "").trim();
  const authEmail = String(user?.email || "").trim().toLowerCase();

  if (!email || email.toLowerCase() === authEmail) {
    return "";
  }

  return email;
}

export function getAutofillLimit(subscriptionTier) {
  return subscriptionTier === "subscriber"
    ? subscriberAutofillDailyLimit
    : freeAutofillDailyLimit;
}

export async function updateUserProfile({ recoveryEmail, username }) {
  const trimmedUsername = username.trim();
  const trimmedRecoveryEmail = recoveryEmail.trim();

  const {
    data: { user },
    error: currentUserError,
  } = await supabase.auth.getUser();

  if (currentUserError) {
    throw currentUserError;
  }

  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...(user?.user_metadata ?? {}),
      name: trimmedUsername,
      profileEmail: trimmedRecoveryEmail,
      recoveryEmail: trimmedRecoveryEmail,
      username: trimmedUsername,
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function changeUserPassword({ newPassword, oldPassword }) {
  const {
    data: { user },
    error: currentUserError,
  } = await supabase.auth.getUser();

  if (currentUserError) {
    throw currentUserError;
  }

  if (!user?.email) {
    throw new Error("Could not validate this account.");
  }

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });

  if (signInError) {
    throw new Error("Current password is incorrect.");
  }

  if (signInData.user?.id !== user.id) {
    throw new Error("Could not validate this account.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw error;
  }

  return data.user;
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
