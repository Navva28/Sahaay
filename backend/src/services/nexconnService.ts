import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Nexconn Server Integration Service
 * 
 * Handles secure server-side communications with Nexconn:
 * - Computes HMAC / SHA1 security signature using App-Secret, Nonce, and Timestamp
 * - Issues official user access tokens through Nexconn server endpoints
 * - Never leaks App Secret to the client application
 */
export class NexconnService {
  private appKey: string;
  private appSecret: string;
  private primaryDomain: string;

  constructor() {
    this.appKey = config.nexconn.appKey;
    this.appSecret = config.nexconn.appSecret;
    this.primaryDomain = config.nexconn.primaryApiDomain.replace(/\/$/, '');
  }

  /**
   * Generates standard Nexconn / RongCloud authentication headers
   * Signature = SHA1(AppSecret + Nonce + Timestamp)
   */
  private generateAuthHeaders(): Record<string, string> {
    const nonce = Math.floor(Math.random() * 1000000).toString();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Hash AppSecret + Nonce + Timestamp
    const hash = crypto.createHash('sha1');
    hash.update(this.appSecret + nonce + timestamp);
    const signature = hash.digest('hex');

    return {
      'App-Key': this.appKey,
      'Nonce': nonce,
      'Timestamp': timestamp,
      'Signature': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  /**
   * Check if credentials are configured
   */
  public hasCredentials(): boolean {
    return Boolean(this.appKey && this.appSecret);
  }

  /**
   * Issues an official Nexconn chat access token for a given user.
   * Calls the server endpoint: POST /v4/auth/access-token/issue or /user/getToken.json
   */
  public async issueUserToken(params: {
    userId: string;
    name: string;
    avatarUrl?: string;
  }): Promise<{ token: string; userId: string; appKey: string }> {
    const { userId, name, avatarUrl = '' } = params;

    // Check if App Secret & Key are available
    if (!this.hasCredentials()) {
      // If credentials haven't been provided yet, throw clear error so user can supply them
      throw new Error(
        'NEXCONN_CREDENTIALS_MISSING: Please configure NEXCONN_APP_KEY and NEXCONN_APP_SECRET in backend/.env'
      );
    }

    const headers = this.generateAuthHeaders();
    
    // Prepare form-encoded body according to Nexconn API specs
    const bodyParams = new URLSearchParams();
    bodyParams.append('userId', userId);
    bodyParams.append('name', name);
    if (avatarUrl) {
      bodyParams.append('portraitUri', avatarUrl);
    }

    const endpoints = [
      `${this.primaryDomain}/v4/auth/access-token/issue`,
      `${this.primaryDomain}/user/getToken.json`,
      'https://api.nexconn.ai/v4/auth/access-token/issue',
      'https://api.nexconn.ai/user/getToken.json'
    ];

    let lastError: any = null;

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: bodyParams.toString(),
        });

        if (response.ok) {
          const data: any = await response.json();
          // Nexconn/RongCloud returns { code: 200, userId: "...", token: "..." }
          if (data && (data.token || (data.data && data.data.token))) {
            const token = data.token || data.data.token;
            return {
              token,
              userId,
              appKey: this.appKey,
            };
          }
        } else {
          const errText = await response.text();
          lastError = new Error(`Nexconn API responded with status ${response.status}: ${errText}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `Failed to issue Nexconn token from server API: ${lastError?.message || 'Unknown network error'}`
    );
  }

  /**
   * Generates a deterministic group channel ID for an assistance request
   */
  public generateChannelId(requestId: string): string {
    return `sahaay_req_${requestId}`;
  }
}

export const nexconnService = new NexconnService();
