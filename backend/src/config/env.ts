import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Nexconn Credentials
  nexconn: {
    appKey: process.env.NEXCONN_APP_KEY || '',
    appSecret: process.env.NEXCONN_APP_SECRET || '',
    primaryApiDomain: process.env.NEXCONN_PRIMARY_API_DOMAIN || 'https://api.nexconn.ai',
    secondaryApiDomain: process.env.NEXCONN_SECONDARY_API_DOMAIN || '',
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },

  // CORS
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
