import { AWS_REGION } from "../utils/constants";
import dotenv from 'dotenv';
dotenv.config();

export const rapidApiCreds = {
    apiUrl: process.env.X_RAPID_API_URL,
    headers: {
        'X-RapidAPI-Key' : process.env.X_RAPID_API_KEY,
        'X-RapidAPI-Host' : process.env.X_RAPID_API_HOST,
    }
};

export const awsCreds = {
    region: AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
}