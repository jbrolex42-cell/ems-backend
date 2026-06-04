const adminMiddleware = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admins only.'
    });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admins only.'
    });
  }
};

module.exports = { adminMiddleware, superAdminOnly };
