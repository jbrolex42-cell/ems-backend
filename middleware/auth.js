const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header("Authorization");

    if (!token) {
      return res.status(401).json({ message: "No token, access denied" });
    }

    // Token format: "Bearer xyz123"
    const actualToken = token.replace("Bearer ", "");

    // Verify token
    const decoded = jwt.verify(
      actualToken,
      process.env.JWT_SECRET
    );

    // Attach user data to request
    req.user = decoded;

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = auth;