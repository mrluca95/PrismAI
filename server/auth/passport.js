import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AuthProvider } from '../lib/auth-providers.js';
import { config } from '../lib/config.js';
import {
  sanitizeUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  updateUser,
} from '../lib/users.js';

const ensureProviderEntry = (providers, provider, providerId) => {
  const list = Array.isArray(providers) ? [...providers] : [];
  if (!list.some((entry) => entry.provider === provider && entry.providerId === providerId)) {
    list.push({ provider, providerId });
  }
  return list;
};

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

const upsertGoogleUser = async (profile) => {
  const primaryEmail = profile.emails?.find((entry) => entry.verified) || profile.emails?.[0];
  if (!primaryEmail?.value) {
    throw new Error('Google account must have an email address');
  }

  const email = String(primaryEmail.value).toLowerCase();
  const image = profile.photos?.[0]?.value || null;
  const displayName = profile.displayName || null;

  let user = await getUserByGoogleId(profile.id);
  if (!user) {
    user = await getUserByEmail(email);
  }

  if (user) {
    const providers = ensureProviderEntry(user.providers, AuthProvider.GOOGLE, profile.id);
    const updated = await updateUser(user.id, {
      email,
      googleId: profile.id,
      name: displayName ?? user.name ?? null,
      imageUrl: image ?? user.imageUrl ?? null,
      providers,
    });
    return sanitizeUser(updated);
  }

  const created = await createUser({
    email,
    googleId: profile.id,
    name: displayName,
    imageUrl: image,
    providers: [
      {
        provider: AuthProvider.GOOGLE,
        providerId: profile.id,
      },
    ],
  });
  return sanitizeUser(created);
};

export const configurePassport = () => {
  const { clientId, clientSecret, callbackUrl } = config.google;
  if (!clientId || !clientSecret || !callbackUrl) {
    console.warn('[auth] Google OAuth credentials missing; Google login disabled.');
    return;
  }

  passport.use(new GoogleStrategy(
    {
      clientID: clientId,
      clientSecret,
      callbackURL: callbackUrl,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertGoogleUser(profile);
        done(null, user);
      } catch (error) {
        done(error);
      }
    },
  ));
};

export default passport;