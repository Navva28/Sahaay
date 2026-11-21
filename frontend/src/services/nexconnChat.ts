import {
  NCEngine,
  GroupChannel,
  GroupChannelIdentifier,
  SendTextMessageParams,
  BaseChannel,
  ConnectionStatus,
  ConnectionStatusHandler,
  MessageHandler,
  Message,
} from '@nexconn/chat';
import { ChatMessage, NexconnConnectionState } from '../types';

export class NexconnChatClient {
  private static instance: NexconnChatClient;
  private isInitialized = false;
  private currentUserId: string | null = null;
  private connectionState: NexconnConnectionState = 'DISCONNECTED';
  private messageListeners: Map<string, (msg: ChatMessage) => void> = new Map();
  private statusListeners: Set<(state: NexconnConnectionState) => void> = new Set();

  private constructor() {
    this.setupGlobalHandlers();
  }

  public static getInstance(): NexconnChatClient {
    if (!NexconnChatClient.instance) {
      NexconnChatClient.instance = new NexconnChatClient();
    }
    return NexconnChatClient.instance;
  }

  private setupGlobalHandlers() {
    try {
      const statusHandler = new ConnectionStatusHandler({
        onConnectionStatusChanged: (event: any) => {
          console.log('[Nexconn] Connection status changed:', event);
          if (event?.status === ConnectionStatus.CONNECTED) {
            this.setConnectionState('CONNECTED');
          } else if (event?.status === ConnectionStatus.CONNECTING) {
            this.setConnectionState('CONNECTING');
          } else {
            this.setConnectionState('DISCONNECTED');
          }
        },
      });
      NCEngine.addConnectionStatusHandler('sahaay_status_handler', statusHandler);

      const msgHandler = new MessageHandler({
        onMessageReceived: (event: any) => {
          console.log('[Nexconn] Real-time message received:', event);
          const rawMessages = event?.messages || (event?.message ? [event.message] : []);
          for (const rawMsg of rawMessages) {
            const text = rawMsg.content?.text || rawMsg.content?.content || '';
            const senderId = rawMsg.senderUserId;

            const normalizedMsg: ChatMessage = {
              messageId: rawMsg.messageId?.toString() || `msg_${Date.now()}_${Math.random()}`,
              senderUserId: senderId,
              text,
              sentTime: rawMsg.sentTime || Date.now(),
              isMe: senderId === this.currentUserId,
            };

            this.messageListeners.forEach((callback) => {
              callback(normalizedMsg);
            });
          }
        },
      });
      NCEngine.addMessageHandler('sahaay_msg_handler', msgHandler);
    } catch (err) {
      console.warn('[Nexconn] Note: Handler registration warning:', err);
    }
  }

  private setConnectionState(state: NexconnConnectionState) {
    this.connectionState = state;
    this.statusListeners.forEach((listener) => listener(state));
  }

  public subscribeStatus(listener: (state: NexconnConnectionState) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.connectionState);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Initializes the Nexconn client engine with public App Key
   */
  public initialize(appKey: string): boolean {
    if (!appKey) {
      this.setConnectionState('CREDENTIALS_MISSING');
      return false;
    }

    try {
      NCEngine.initialize({ appKey });
      this.isInitialized = true;
      console.log('✅ Nexconn Engine initialized successfully with App Key');
      return true;
    } catch (err) {
      console.error('❌ Failed to initialize Nexconn Engine:', err);
      this.setConnectionState('FAILED');
      return false;
    }
  }

  /**
   * Connects to Nexconn servers using user access token issued by backend
   */
  public async connect(token: string, userId: string): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('[Nexconn] Client not yet initialized with App Key.');
      return false;
    }

    this.currentUserId = userId;
    this.setConnectionState('CONNECTING');

    try {
      const result = await NCEngine.connect({ token });
      if (result && result.isOk) {
        console.log('✅ Nexconn connected successfully as user:', result.data?.userId || userId);
        this.setConnectionState('CONNECTED');
        return true;
      } else {
        console.warn('⚠️ Nexconn connect returned not OK:', result?.msg);
        this.setConnectionState('FAILED');
        return false;
      }
    } catch (err) {
      console.error('❌ Nexconn connection exception:', err);
      this.setConnectionState('FAILED');
      return false;
    }
  }

  /**
   * Ensure group exists on Nexconn for the assistance request
   */
  public async ensureGroupChannel(channelId: string, groupName: string, memberUserIds: string[]): Promise<boolean> {
    try {
      const result = await GroupChannel.createGroup({
        groupId: channelId,
        groupName: groupName || `Sahaay Assistance #${channelId}`,
        inviteeUserIds: memberUserIds,
      });

      console.log('GroupChannel createGroup result:', result);
      return true;
    } catch (err: any) {
      // If group already exists, this is idempotent
      console.log('Group channel ready / existing:', err?.message || err);
      return true;
    }
  }

  /**
   * Loads message history for a group channel
   */
  public async loadMessageHistory(channelId: string, pageSize: number = 50): Promise<ChatMessage[]> {
    try {
      const channelIdentifier = new GroupChannelIdentifier(channelId);
      const query = BaseChannel.createMessagesQuery({
        channelIdentifier,
        pageSize,
      });

      const pageResult = await query.loadNextPage();
      if (pageResult && pageResult.isOk && Array.isArray(pageResult.data)) {
        return pageResult.data.map((msg: Message<any>) => ({
          messageId: msg.messageId?.toString() || `msg_${Math.random()}`,
          senderUserId: msg.senderUserId,
          text: msg.content?.text || msg.content?.content || '',
          sentTime: msg.sentTime || Date.now(),
          isMe: msg.senderUserId === this.currentUserId,
        }));
      }

      return [];
    } catch (err) {
      console.warn('Could not query message history from Nexconn:', err);
      return [];
    }
  }

  /**
   * Sends a text message to the group channel
   */
  public async sendTextMessage(channelId: string, text: string): Promise<ChatMessage> {
    const group = new GroupChannel(channelId);
    const params = new SendTextMessageParams({ text });

    const result = await group.sendMessage(params);
    if (!result.isOk) {
      throw new Error(`Failed to send message: ${result.msg || 'Unknown error'}`);
    }

    const rawMsg = result.data;
    return {
      messageId: rawMsg?.messageId?.toString() || `msg_${Date.now()}`,
      senderUserId: this.currentUserId || '',
      text,
      sentTime: rawMsg?.sentTime || Date.now(),
      isMe: true,
      status: 'sent',
    };
  }

  /**
   * Register a listener for incoming messages on an active channel
   */
  public registerMessageListener(listenerKey: string, callback: (msg: ChatMessage) => void): () => void {
    this.messageListeners.set(listenerKey, callback);
    return () => {
      this.messageListeners.delete(listenerKey);
    };
  }

  public getConnectionState(): NexconnConnectionState {
    return this.connectionState;
  }

  public getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

export const nexconnChat = NexconnChatClient.getInstance();
