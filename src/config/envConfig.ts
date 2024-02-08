import dotenv from 'dotenv';
dotenv.config();

export const config = {
  databaseURL: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  port: process.env.PORT || 3000
};