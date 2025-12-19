import logger from '../config/logger';
import transporter from '../config/email';

export const sendVerificationEmail = async (email: string, otpCode: string) => {
  try {
    await transporter.sendMail({
      from: `"HonestMM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification Code',
      html: `
        <div style="
            font-family: 'Helvetica Neue', Arial, sans-serif;
            max-width: 600px;
            margin: 20px auto;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        <!-- Header -->
        <div style="
            background-color: #1a73e8;
            padding: 24px;
            text-align: center;
            color: white;
        ">
            <h1 style="margin: 0; font-size: 24px; font-weight: 500;">📧 Verify Your Email Address</h1>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
            <p style="
            font-size: 16px;
            line-height: 1.5;
            color: #202124;
            margin-bottom: 24px;
            ">
            To complete your account setup, please verify your email address using the OTP code below:
            </p>

            <!-- OTP Display with Copy Button -->
            <div style="width: 100%; text-align: center; margin: 20px 0;">
            <span style="
                display: inline-block;
                background-color: #f8f9fa;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 20px;
                font-size: 28px;
                font-weight: 600;
                letter-spacing: 2px;
                color: #1a73e8;
                min-width: 120px;
            ">
                ${otpCode}
            </span>
            </div>

            <!-- Footer Notes -->
            <p style="
            font-size: 14px;
            color: #5f6368;
            line-height: 1.5;
            margin-bottom: 0;
            text-align: center;
            ">
            <strong>Note:</strong> This OTP expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
            </p>
        </div>

        <!-- Footer -->
        <div style="
            background-color: #f8f9fa;
            padding: 16px;
            text-align: center;
            font-size: 12px;
            color: #70757a;
            border-top: 1px solid #e0e0e0;
            ">
            © ${new Date().getFullYear()} HonestMM. All rights reserved.
            </div>
        </div>
      `,
    });

    logger.info('email sent successfully');
  } catch (error: any) {
    logger.error(`${error.message}, email not sent`);
  }
};

export const sendResetPasswordEmail = async (email: string, token: string) => {
  try {
    await transporter.sendMail({
      from: `"HonestMM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your Password',
      html: `
        <div style="
            font-family: 'Helvetica Neue', Arial, sans-serif;
            max-width: 600px;
            margin: 20px auto;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            ">
            <!-- Header -->
            <div style="
                background-color: #1a73e8;
                padding: 24px;
                text-align: center;
                color: white;
            ">
                <h1 style="margin: 0; font-size: 24px; font-weight: 500;">🔐 Reset Your Password</h1>
            </div>

            <!-- Content -->
            <div style="padding: 32px 24px;">
                <p style="
                font-size: 16px;
                line-height: 1.5;
                color: #202124;
                margin-bottom: 24px;
                ">
                <strong style="color: #d93025;">⚠️ Do not share this OTP with anyone.</strong><br>
                Use the following code to reset your password:
                </p>

                <!-- OTP Display -->
                <div style="
                background-color: #f8f9fa;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                font-size: 28px;
                font-weight: 600;
                letter-spacing: 2px;
                color: #1a73e8;
                margin: 20px 0;
                ">
                ${token}
                </div>

                <!-- Reset Button -->
                <div style="text-align: center; margin: 32px 0;">
                <a
                    href="https://tutor.learnica.net/reset-password/${encodeURIComponent(token)}"
                    style="
                    display: inline-block;
                    background-color: #1a73e8;
                    color: white;
                    padding: 14px 28px;
                    font-size: 16px;
                    font-weight: 500;
                    border-radius: 8px;
                    text-decoration: none;
                    transition: background-color 0.2s;
                    "
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseOver="this.style.backgroundColor='#0d62c9'"
                    onMouseOut="this.style.backgroundColor='#1a73e8'"
                >
                    Reset Password
                </a>
                </div>

                <!-- Footer Notes -->
                <p style="
                font-size: 14px;
                color: #5f6368;
                line-height: 1.5;
                margin-bottom: 0;
                ">
                <strong>Note:</strong> This OTP expires in <strong>10 minutes</strong>. If you didn’t request this, ignore this email.
                </p>
            </div>

            <!-- Footer -->
            <div style="
                background-color: #f8f9fa;
                padding: 16px;
                text-align: center;
                font-size: 12px;
                color: #70757a;
                border-top: 1px solid #e0e0e0;
            ">
                © ${new Date().getFullYear()} HonestMM. All rights reserved.
            </div>
        </div>
      `,
    });

    logger.info('Reset password email sent successfully');
  } catch (error: any) {
    logger.error(`${error.message}, reset password email not sent`);
  }
};
