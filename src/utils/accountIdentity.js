export function normalizeLoginUsername(username) {
  return String(username ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createAuthEmailForProject(username, supabaseUrl) {
  const projectHost = new URL(supabaseUrl).hostname;
  return `${normalizeLoginUsername(username)}@${projectHost}`;
}

export function createSignupMetadata(username, recoveryEmail) {
  const loginUsername = String(username ?? "").trim();

  return {
    name: loginUsername,
    profileEmail: String(recoveryEmail ?? "").trim(),
    username: loginUsername,
  };
}

export function getLoginUsername(user) {
  const metadataUsername = String(user?.user_metadata?.username ?? "").trim();
  const authEmailUsername = String(user?.email?.split("@")[0] ?? "").trim();

  if (
    metadataUsername &&
    (!authEmailUsername ||
      normalizeLoginUsername(metadataUsername) === authEmailUsername)
  ) {
    return metadataUsername;
  }

  return (
    authEmailUsername ||
    metadataUsername ||
    user?.user_metadata?.name ||
    "Learner"
  );
}

export function getDisplayName(user) {
  return user?.user_metadata?.name || getLoginUsername(user);
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

export function createUpdatedProfileMetadata(
  user,
  { displayName, recoveryEmail },
) {
  const trimmedRecoveryEmail = String(recoveryEmail ?? "").trim();

  return {
    ...(user?.user_metadata ?? {}),
    name: String(displayName ?? "").trim(),
    profileEmail: trimmedRecoveryEmail,
    recoveryEmail: trimmedRecoveryEmail,
  };
}
