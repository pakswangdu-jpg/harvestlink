import { uniqueProfilesById } from './mapMarkerUtils.js';

export function includeCurrentRoleProfile(profiles, role, currentUser) {
  if (currentUser?.role !== role || currentUser.id == null || currentUser.id === '') return profiles;

  const currentUserId = String(currentUser.id);
  const profileIndex = profiles.findIndex((profile) => String(profile.id) === currentUserId);
  const currentProfile = {
    ...(profileIndex < 0 ? {} : profiles[profileIndex]),
    ...currentUser,
    role,
  };

  if (profileIndex < 0) return [...profiles, currentProfile];
  const nextProfiles = [...profiles];
  nextProfiles[profileIndex] = currentProfile;
  return nextProfiles;
}

export function getMapProfilesForRole(
  profiles,
  directoryProfiles,
  role,
  query,
  visible,
  searchFields,
  currentUser,
) {
  if (!visible) return [];

  const directoryById = new Map(directoryProfiles.map((profile) => [String(profile.id), profile]));
  const roleProfiles = includeCurrentRoleProfile(
    uniqueProfilesById(profiles.filter((profile) => profile.role === role)),
    role,
    currentUser,
  );

  const normalizedQuery = query.trim().toLowerCase();
  return roleProfiles
    .map((profile) => ({
      ...profile,
      ...directoryById.get(String(profile.id)),
      role,
    }))
    .filter((profile) => !normalizedQuery || searchFields
      .map((field) => profile[field] || '')
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery));
}
