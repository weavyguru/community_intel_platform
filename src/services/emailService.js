const { sgMail, getFromEmail } = require('../config/sendgrid');
const crypto = require('crypto');

class EmailService {
  async sendVerificationEmail(user, verificationToken) {
    try {
      const verificationUrl = `${process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`}/api/auth/verify/${verificationToken}`;

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
      const resetUrl = `${process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`}/reset-password/${resetToken}`;

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
              <a href="${process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`}/tasks" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
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

  async sendTaskDelegationEmail(task, delegatedUser) {
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;
      const taskCompleteUrl = `${baseUrl}/tasks?taskId=${task._id}&done=true`;
      const taskViewUrl = `${baseUrl}/tasks?taskId=${task._id}`;

      const msg = {
        to: delegatedUser.email,
        from: getFromEmail(),
        subject: `Task Delegated: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've Been Tasked!</h2>
            <p>Hi ${delegatedUser.name},</p>
            <p>You've been tasked to respond to this post from <strong>${task.platform}</strong>.</p>

            <div style="background-color: #F3F4F6; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0;">${task.title}</h3>
              <p style="color: #6B7280; margin: 5px 0;">${task.snippet}</p>
              ${task.metadata?.author ? `<p style="color: #6B7280; font-size: 12px; margin-top: 10px;">Author: ${task.metadata.author}</p>` : ''}
            </div>

            ${task.reasoning ? `
              <div style="margin: 20px 0;">
                <h3>Why This Matters</h3>
                <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 15px; border-radius: 6px;">
                  <p style="margin: 0; color: #1E40AF;">${task.reasoning}</p>
                </div>
              </div>
            ` : ''}

            ${task.suggestedResponse ? `
              <div style="margin: 20px 0;">
                <h3>Suggested Response</h3>
                <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 6px; padding: 15px;">
                  <p style="margin: 0; white-space: pre-wrap;">${task.suggestedResponse}</p>
                </div>
                <p style="color: #6B7280; font-size: 12px; margin-top: 5px;">Feel free to tweak this response before posting!</p>
              </div>
            ` : ''}

            <div style="margin: 30px 0;">
              <h3>What to do:</h3>
              <ol style="color: #4B5563;">
                <li>Click the link below to view the source post</li>
                <li>Copy and paste the suggested response (or customize it)</li>
                <li>Submit your response on ${task.platform}</li>
                <li>When you're done, click the "Done it!" button below</li>
              </ol>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${task.sourceUrl}" target="_blank" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 0 10px 10px 0;">
                View Source Post →
              </a>
              <a href="${taskCompleteUrl}" style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 0 0 10px 0;">
                ✓ Done it!
              </a>
            </div>

            <p style="color: #6B7280; font-size: 12px; text-align: center;">
              Or <a href="${taskViewUrl}" style="color: #4F46E5;">view the task details</a> in the platform
            </p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform</p>
          </div>
        `
      };

      await sgMail.send(msg);
      console.log(`Task delegation email sent to ${delegatedUser.email} for task ${task._id}`);
    } catch (error) {
      console.error('Error sending task delegation email:', error);
      throw error;
    }
  }

  async sendBackgroundJobSuccessReport(admins, jobResult, createdTasks) {
    try {
      if (!admins || admins.length === 0) {
        console.log('No admins to notify for background job success');
        return;
      }

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;

      // Format tasks HTML
      let tasksHtml = '';
      if (createdTasks && createdTasks.length > 0) {
        tasksHtml = '<h3 style="margin-top: 20px;">Created Tasks</h3>';
        createdTasks.forEach((task, index) => {
          const taskUrl = `${baseUrl}/tasks?taskId=${task._id}`;
          const priorityColor = task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? '#F59E0B' : '#10B981';

          tasksHtml += `
            <div style="border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px; margin: 10px 0;">
              <h4 style="margin: 0 0 10px 0;">${index + 1}. ${task.title}</h4>
              <p style="color: #6B7280; margin: 5px 0; font-size: 14px;">${task.snippet?.substring(0, 150) || ''}...</p>
              <div style="margin-top: 10px;">
                <span style="background-color: ${priorityColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;">
                  ${task.priority?.toUpperCase()}
                </span>
                <span style="background-color: #DBEAFE; color: #1E40AF; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;">
                  ${task.platform}
                </span>
              </div>
              <div style="margin-top: 10px;">
                <a href="${task.sourceUrl}" target="_blank" style="color: #4F46E5; font-size: 12px; margin-right: 15px;">View Source →</a>
                <a href="${taskUrl}" style="color: #10B981; font-size: 12px;">View Task →</a>
              </div>
            </div>
          `;
        });
      } else {
        tasksHtml = '<p style="color: #6B7280; font-style: italic;">No new tasks were created in this run.</p>';
      }

      const messages = admins.map(admin => ({
        to: admin.email,
        from: getFromEmail(),
        subject: `Background Job Success: ${createdTasks.length} Task(s) Created`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <h2>Background Intelligence Job Report</h2>
            <p>Hi ${admin.name},</p>
            <p>The background intelligence job completed successfully.</p>

            <div style="background-color: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0;">
              <strong>✓ Job Completed Successfully</strong>
            </div>

            <h3>Job Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Last Run:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${new Date(jobResult.timestamp || Date.now()).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Posts Processed:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${jobResult.processed || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Posts Analyzed:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${jobResult.analyzed || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Tasks Created:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${jobResult.tasksCreated || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Duration:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${jobResult.duration ? (jobResult.duration / 1000).toFixed(1) + 's' : 'N/A'}</td>
              </tr>
            </table>

            ${tasksHtml}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/tasks" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View All Tasks
              </a>
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform - Automated Report</p>
          </div>
        `
      }));

      await sgMail.send(messages);
      console.log(`Background job success report sent to ${admins.length} admin(s)`);
    } catch (error) {
      console.error('Error sending background job success report:', error);
      // Don't throw - we don't want email failures to break the job
    }
  }

  async sendBackgroundJobFailureReport(admins, errorInfo) {
    try {
      if (!admins || admins.length === 0) {
        console.log('No admins to notify for background job failure');
        return;
      }

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;

      const messages = admins.map(admin => ({
        to: admin.email,
        from: getFromEmail(),
        subject: '⚠️ Background Job Failed',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <h2>Background Intelligence Job Failed</h2>
            <p>Hi ${admin.name},</p>
            <p>The background intelligence job encountered an error and failed to complete.</p>

            <div style="background-color: #FEE2E2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0;">
              <strong>✗ Job Failed</strong>
            </div>

            <h3>Failure Details</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;"><strong>Failed At:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${new Date(errorInfo.timestamp || Date.now()).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; vertical-align: top;"><strong>Error:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; word-break: break-word;">${errorInfo.error || 'Unknown error'}</td>
              </tr>
            </table>

            <div style="background-color: #F3F4F6; border-radius: 6px; padding: 15px; margin: 20px 0;">
              <h4 style="margin-top: 0;">Recommended Actions:</h4>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Check server logs for detailed error information</li>
                <li>Verify external service connectivity (Claude AI, ChromaDB)</li>
                <li>Check API rate limits and quotas</li>
                <li>Review recent configuration changes</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/admin/bg-agent" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Background Agent Config
              </a>
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">Weavy Community Intelligence Platform - Automated Alert</p>
          </div>
        `
      }));

      await sgMail.send(messages);
      console.log(`Background job failure report sent to ${admins.length} admin(s)`);
    } catch (error) {
      console.error('Error sending background job failure report:', error);
      // Don't throw - we don't want email failures to break the job
    }
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = new EmailService();
