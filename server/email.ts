import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from: string;
  service?: string;
  apiKey?: string;
}

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private isEnabled: boolean = false;

  constructor() {
    this.config = {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || 'noreply@eirvana.com',
      service: process.env.EMAIL_SERVICE,
      apiKey: process.env.EMAIL_API_KEY,
    };

    this.initializeTransporter();
  }

  private initializeTransporter() {
    try {
      // Check if email is configured
      if (!this.config.host && !this.config.service) {
        console.log('[EmailService] No email configuration found - emails will be logged to console');
        this.isEnabled = false;
        return;
      }

      if (this.config.service === 'sendgrid' && this.config.apiKey) {
        // SendGrid configuration
        this.transporter = nodemailer.createTransport({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: this.config.apiKey,
          },
        });
      } else if (this.config.host && this.config.user && this.config.pass) {
        // SMTP configuration
        this.transporter = nodemailer.createTransport({
          host: this.config.host,
          port: this.config.port!,
          secure: this.config.port === 465, // true for 465, false for other ports
          auth: {
            user: this.config.user,
            pass: this.config.pass,
          },
          tls: {
            rejectUnauthorized: false, // For development
          },
        });
      } else {
        console.log('[EmailService] Incomplete email configuration - emails will be logged to console');
        this.isEnabled = false;
        return;
      }

      this.isEnabled = true;
      console.log('[EmailService] Email service initialized successfully');
    } catch (error) {
      console.error('[EmailService] Failed to initialize email service:', error);
      this.isEnabled = false;
    }
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    try {
      if (!this.isEnabled || !this.transporter) {
        // Log email to console in development/when not configured
        console.log('\n=== EMAIL WOULD BE SENT ===');
        console.log(`To: ${emailData.to}`);
        console.log(`Subject: ${emailData.subject}`);
        console.log(`From: ${this.config.from}`);
        console.log('--- HTML Content ---');
        console.log(emailData.html);
        if (emailData.text) {
          console.log('--- Text Content ---');
          console.log(emailData.text);
        }
        console.log('=========================\n');
        return true;
      }

      const mailOptions = {
        from: this.config.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[EmailService] Email sent successfully to ${emailData.to}:`, result.messageId);
      return true;
    } catch (error) {
      const timestamp = new Date().toISOString();
      const err = error as Error;
      const errorContext = {
        timestamp,
        recipient: emailData.to,
        subject: emailData.subject,
        errorMessage: err.message || 'Unknown error',
        errorCode: (err as any).code || 'UNKNOWN',
        errorStack: err.stack || 'No stack trace available',
        emailConfig: {
          isEnabled: this.isEnabled,
          hasTransporter: !!this.transporter,
          configuredHost: this.config.host,
          configuredService: this.config.service,
          configuredFrom: this.config.from
        },
        environment: process.env.NODE_ENV
      };

      console.error(`[EmailService] ${timestamp} - Failed to send email to ${emailData.to}:`, errorContext);
      
      // Enhanced production logging
      if (process.env.NODE_ENV === 'production') {
        console.error(`[PRODUCTION_EMAIL_SERVICE_ERROR] Critical email delivery failure:`, {
          ...errorContext,
          severity: 'HIGH',
          component: 'EmailService',
          action: 'INVESTIGATE_EMAIL_CONFIG'
        });
      }
      
      return false;
    }
  }

  async sendWaitlistConfirmation(email: string, name: string): Promise<boolean> {
    const emailData = {
      to: email,
      subject: 'Welcome to the Eirvana Waitlist!',
      html: this.generateWaitlistConfirmationHTML(name),
      text: this.generateWaitlistConfirmationText(name),
    };

    return await this.sendEmail(emailData);
  }

  async sendRegistrationWelcome(email: string, username: string): Promise<boolean> {
    const emailData = {
      to: email,
      subject: 'Welcome to Eirvana!',
      html: this.generateRegistrationWelcomeHTML(username),
      text: this.generateRegistrationWelcomeText(username),
    };

    return await this.sendEmail(emailData);
  }

  async sendWaitlistVerification(email: string, name: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/verify-waitlist?token=${token}&email=${encodeURIComponent(email)}`;
    
    const emailData = {
      to: email,
      subject: 'Confirm Your Email - Eirvana Waitlist',
      html: this.generateWaitlistVerificationHTML(name, verificationUrl),
      text: this.generateWaitlistVerificationText(name, verificationUrl),
    };

    return await this.sendEmail(emailData);
  }

  async sendRegistrationVerification(email: string, username: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/verify-registration?token=${token}&email=${encodeURIComponent(email)}`;
    
    const emailData = {
      to: email,
      subject: 'Verify Your Eirvana Account',
      html: this.generateRegistrationVerificationHTML(username, verificationUrl),
      text: this.generateRegistrationVerificationText(username, verificationUrl),
    };

    return await this.sendEmail(emailData);
  }

  private generateWaitlistConfirmationHTML(name: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Eirvana Waitlist</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
        .content { padding: 30px 0; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
        .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Eirvana</div>
        </div>
        
        <div class="content">
            <h1>Welcome to the Eirvana Waitlist, ${name}! 🎉</h1>
            
            <p>Thank you for your interest in Eirvana! We're excited to have you on our waitlist.</p>
            
            <p>You're now part of an exclusive group who will be the first to experience our revolutionary AI-powered platform when we launch.</p>
            
            <p><strong>What happens next?</strong></p>
            <ul>
                <li>We'll keep you updated on our development progress</li>
                <li>You'll receive early access invitations</li>
                <li>You'll be among the first to try new features</li>
            </ul>
            
            <p>Stay tuned for updates, and thank you for being part of the Eirvana journey!</p>
        </div>
        
        <div class="footer">
            <p>This email was sent to you because you joined the Eirvana waitlist.</p>
            <p>© ${new Date().getFullYear()} Eirvana. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateWaitlistConfirmationText(name: string): string {
    return `
Welcome to the Eirvana Waitlist, ${name}!

Thank you for your interest in Eirvana! We're excited to have you on our waitlist.

You're now part of an exclusive group who will be the first to experience our revolutionary AI-powered platform when we launch.

What happens next?
- We'll keep you updated on our development progress
- You'll receive early access invitations
- You'll be among the first to try new features

Stay tuned for updates, and thank you for being part of the Eirvana journey!

© ${new Date().getFullYear()} Eirvana. All rights reserved.
`;
  }

  private generateRegistrationWelcomeHTML(username: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Eirvana</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
        .content { padding: 30px 0; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
        .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .feature { padding: 15px; margin: 10px 0; background: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Eirvana</div>
        </div>
        
        <div class="content">
            <h1>Welcome to Eirvana! 🚀</h1>
            
            <p>Hi ${username},</p>
            
            <p>Your account has been successfully created! We're thrilled to have you join the Eirvana community.</p>
            
            <div class="feature">
                <h3>🤖 AI-Powered Conversations</h3>
                <p>Experience natural, intelligent conversations powered by cutting-edge AI technology.</p>
            </div>
            
            <div class="feature">
                <h3>💬 Smart Chat Interface</h3>
                <p>Enjoy our intuitive chat interface designed for seamless interactions.</p>
            </div>
            
            <div class="feature">
                <h3>🔒 Secure & Private</h3>
                <p>Your data is protected with enterprise-grade security and privacy measures.</p>
            </div>
            
            <p><strong>Ready to get started?</strong></p>
            <p>Log into your account and begin exploring the future of AI-powered conversations.</p>
            
            <p>If you have any questions or need assistance, our support team is here to help.</p>
            
            <p>Welcome aboard!</p>
        </div>
        
        <div class="footer">
            <p>This email was sent to you because you created an account on Eirvana.</p>
            <p>© ${new Date().getFullYear()} Eirvana. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateRegistrationWelcomeText(username: string): string {
    return `
Welcome to Eirvana!

Hi ${username},

Your account has been successfully created! We're thrilled to have you join the Eirvana community.

What you can do with Eirvana:
🤖 AI-Powered Conversations - Experience natural, intelligent conversations powered by cutting-edge AI technology
💬 Smart Chat Interface - Enjoy our intuitive chat interface designed for seamless interactions  
🔒 Secure & Private - Your data is protected with enterprise-grade security and privacy measures

Ready to get started?
Log into your account and begin exploring the future of AI-powered conversations.

If you have any questions or need assistance, our support team is here to help.

Welcome aboard!

© ${new Date().getFullYear()} Eirvana. All rights reserved.
`;
  }

  private generateWaitlistVerificationHTML(name: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirm Your Email - Eirvana Waitlist</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
        .content { padding: 30px 0; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
        .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { background: #fef3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Eirvana</div>
        </div>
        
        <div class="content">
            <h1>Please Confirm Your Email Address 📧</h1>
            
            <p>Hi ${name},</p>
            
            <p>Thank you for your interest in joining the Eirvana waitlist! To complete your registration, please confirm your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Confirm Email Address</a>
            </div>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f8fafc; padding: 10px; border-radius: 4px; font-family: monospace;">${verificationUrl}</p>
            
            <div class="warning">
                <strong>⚠️ Important:</strong> This verification link will expire in 24 hours. If you don't verify your email within this time, you'll need to sign up again.
            </div>
            
            <p>Once verified, you'll receive a confirmation email and be added to our exclusive waitlist.</p>
            
            <p>If you didn't sign up for the Eirvana waitlist, please ignore this email.</p>
        </div>
        
        <div class="footer">
            <p>This verification email was sent because someone requested to join the Eirvana waitlist with this email address.</p>
            <p>© ${new Date().getFullYear()} Eirvana. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateWaitlistVerificationText(name: string, verificationUrl: string): string {
    return `
Please Confirm Your Email Address

Hi ${name},

Thank you for your interest in joining the Eirvana waitlist! To complete your registration, please confirm your email address by visiting this link:

${verificationUrl}

⚠️ Important: This verification link will expire in 24 hours. If you don't verify your email within this time, you'll need to sign up again.

Once verified, you'll receive a confirmation email and be added to our exclusive waitlist.

If you didn't sign up for the Eirvana waitlist, please ignore this email.

© ${new Date().getFullYear()} Eirvana. All rights reserved.
`;
  }

  private generateRegistrationVerificationHTML(username: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirm Your Email - Eirvana Account</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
        .content { padding: 30px 0; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
        .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { background: #fef3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Eirvana</div>
        </div>
        
        <div class="content">
            <h1>Verify Your Eirvana Account 🚀</h1>
            
            <p>Hi ${username},</p>
            
            <p>Welcome to Eirvana! To activate your account and start experiencing our AI-powered platform, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f8fafc; padding: 10px; border-radius: 4px; font-family: monospace;">${verificationUrl}</p>
            
            <div class="warning">
                <strong>⚠️ Important:</strong> This verification link will expire in 24 hours. If you don't verify your email within this time, your account will remain inactive.
            </div>
            
            <p>Once verified, you'll have full access to:</p>
            <ul>
                <li>🤖 AI-powered conversations</li>
                <li>💬 Smart chat interface</li>
                <li>🔒 Secure, private messaging</li>
            </ul>
            
            <p>If you didn't create an Eirvana account, please ignore this email.</p>
        </div>
        
        <div class="footer">
            <p>This verification email was sent because an account was created with this email address on Eirvana.</p>
            <p>© ${new Date().getFullYear()} Eirvana. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateRegistrationVerificationText(username: string, verificationUrl: string): string {
    return `
Verify Your Eirvana Account

Hi ${username},

Welcome to Eirvana! To activate your account and start experiencing our AI-powered platform, please verify your email address by visiting this link:

${verificationUrl}

⚠️ Important: This verification link will expire in 24 hours. If you don't verify your email within this time, your account will remain inactive.

Once verified, you'll have full access to:
🤖 AI-powered conversations
💬 Smart chat interface  
🔒 Secure, private messaging

If you didn't create an Eirvana account, please ignore this email.

© ${new Date().getFullYear()} Eirvana. All rights reserved.
`;
  }

  // Test email connectivity
  async testConnection(): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      console.log('[EmailService] Email service not configured - skipping connection test');
      return true; // Return true for development when not configured
    }

    try {
      await this.transporter.verify();
      console.log('[EmailService] Email connection test successful');
      return true;
    } catch (error) {
      console.error('[EmailService] Email connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();