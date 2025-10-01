const { sgMail, getFromEmail } = require('../config/sendgrid');
const crypto = require('crypto');

class EmailService {
  async sendVerificationEmail(user, verificationToken) {
    try {
      const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/verify/${verificationToken}`;

      const msg = {
        to: user.email,
        from: getFromEmail(),
        subject: 'Verify Your Email - Community Intelligence Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to the Community Intelligence Platform!</h2>
            <p>Hi ${user.name},</p>
            <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create this account, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform</p>
          </div>
        `
      };

      await sgMail.send(msg);
      console.log(`Verification email sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(user, resetToken) {
    try {
      const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

      const msg = {
        to: user.email,
        from: getFromEmail(),
        subject: 'Reset Your Password - Community Intelligence Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>Hi ${user.name},</p>
            <p>You requested to reset your password. Click the button below to proceed:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform</p>
          </div>
        `
      };

      await sgMail.send(msg);
      console.log(`Password reset email sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  }

  async sendTaskNotification(users, tasks) {
    try {
      if (!users || users.length === 0 || !tasks || tasks.length === 0) {
        return;
      }

      const highPriorityTasks = tasks.filter(t => t.priority === 'high');
      const mediumPriorityTasks = tasks.filter(t => t.priority === 'medium');

      const tasksHtml = this._formatTasksHtml(highPriorityTasks, mediumPriorityTasks);

      const messages = users.map(user => ({
        to: user.email,
        from: getFromEmail(),
        subject: `New Community Intelligence: ${highPriorityTasks.length} High Priority Items`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <h2>New Community Intelligence Report</h2>
            <p>Hi ${user.name},</p>
            <p>The background intelligence agent has identified ${tasks.length} new actionable items from community activity:</p>

            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <strong>High Priority:</strong> ${highPriorityTasks.length} items requiring immediate attention
            </div>

            ${tasksHtml}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}/tasks" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View All Tasks
              </a>
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform</p>
          </div>
        `
      }));

      await sgMail.send(messages);
      console.log(`Task notifications sent to ${users.length} users`);
    } catch (error) {
      console.error('Error sending task notifications:', error);
      throw error;
    }
  }

  _formatTasksHtml(highPriorityTasks, mediumPriorityTasks) {
    let html = '';

    if (highPriorityTasks.length > 0) {
      html += '<h3 style="color: #DC2626;">High Priority Tasks</h3>';
      highPriorityTasks.forEach(task => {
        html += `
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px; margin: 10px 0;">
            <h4 style="margin: 0 0 10px 0;">${task.title}</h4>
            <p style="color: #6B7280; margin: 5px 0;">${task.snippet}</p>
            <div style="margin-top: 10px;">
              <span style="background-color: #DBEAFE; color: #1E40AF; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;">
                ${task.platform}
              </span>
              <span style="color: #6B7280; font-size: 12px;">${task.intent || 'General'}</span>
            </div>
            <a href="${task.sourceUrl}" style="color: #4F46E5; font-size: 12px; margin-top: 10px; display: inline-block;">View Source →</a>
          </div>
        `;
      });
    }

    if (mediumPriorityTasks.length > 0) {
      html += '<h3 style="color: #F59E0B; margin-top: 30px;">Medium Priority Tasks</h3>';
      mediumPriorityTasks.slice(0, 5).forEach(task => {
        html += `
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px; margin: 10px 0;">
            <h4 style="margin: 0 0 10px 0;">${task.title}</h4>
            <p style="color: #6B7280; margin: 5px 0; font-size: 14px;">${task.snippet.substring(0, 150)}...</p>
            <span style="background-color: #DBEAFE; color: #1E40AF; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${task.platform}
            </span>
          </div>
        `;
      });

      if (mediumPriorityTasks.length > 5) {
        html += `<p style="color: #6B7280; font-style: italic;">... and ${mediumPriorityTasks.length - 5} more medium priority tasks</p>`;
      }
    }

    return html;
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = new EmailService();
