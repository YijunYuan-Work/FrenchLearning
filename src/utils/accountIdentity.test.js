import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthEmailForProject,
  createSignupMetadata,
  createUpdatedProfileMetadata,
  getDisplayName,
  getLoginUsername,
  getProfileRecoveryEmail,
} from "./accountIdentity.js";

test("signup metadata preserves the login username and initial display name", () => {
  assert.deepEqual(createSignupMetadata(" John Smith ", " john@example.com "), {
    name: "John Smith",
    profileEmail: "john@example.com",
    username: "John Smith",
  });
  assert.equal(
    createAuthEmailForProject(" John Smith ", "https://demo.supabase.co"),
    "john-smith@demo.supabase.co",
  );
});

test("profile edits change display metadata without changing the login username", () => {
  const user = {
    email: "john@demo.supabase.co",
    user_metadata: { name: "John", username: "john", unrelated: "keep" },
  };

  const metadata = createUpdatedProfileMetadata(user, {
    displayName: "Jean",
    recoveryEmail: "recovery@example.com",
  });

  assert.deepEqual(metadata, {
    name: "Jean",
    profileEmail: "recovery@example.com",
    recoveryEmail: "recovery@example.com",
    unrelated: "keep",
    username: "john",
  });
  assert.equal(getLoginUsername({ ...user, user_metadata: metadata }), "john");
  assert.equal(getDisplayName({ ...user, user_metadata: metadata }), "Jean");
});

test("identity helpers support existing accounts and hide the synthetic auth email", () => {
  const legacyUser = {
    email: "legacy-user@demo.supabase.co",
    user_metadata: { name: "Legacy Name" },
  };

  assert.equal(getLoginUsername(legacyUser), "legacy-user");
  assert.equal(getDisplayName(legacyUser), "Legacy Name");
  assert.equal(getProfileRecoveryEmail(legacyUser), "");
  assert.equal(
    getProfileRecoveryEmail({
      ...legacyUser,
      user_metadata: { profileEmail: "person@example.com" },
    }),
    "person@example.com",
  );
});

test("the immutable auth email repairs display of previously overwritten username metadata", () => {
  const user = {
    email: "original-login@demo.supabase.co",
    user_metadata: { name: "Display Name", username: "changed-in-profile" },
  };

  assert.equal(getLoginUsername(user), "original-login");
  assert.equal(getDisplayName(user), "Display Name");

  assert.deepEqual(
    createUpdatedProfileMetadata(user, {
      displayName: "Updated Display Name",
      recoveryEmail: "recovery@example.com",
    }),
    {
      name: "Updated Display Name",
      profileEmail: "recovery@example.com",
      recoveryEmail: "recovery@example.com",
      username: "original-login",
    },
  );
});
