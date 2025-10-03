export const requireAuth = (req, res, next) => {
  if (req.user) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required.' });
};

export const optionalAuth = (req, res, next) => {
  if (req.user) {
    res.locals.user = req.user;
  }
  next();
};
