require('dotenv').config();
const fs = require('fs');
const path = require('path');
const login = require('facebook-chat-api');
const axios = require('axios');
const readline = require('readline');

// কনফিগারেশন
const CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'your-openai-api-key',
  MODEL: 'gpt-3.5-turbo',
  TEMPERATURE: 0.7,
  REPLY_DELAY: 1500,
  MAX_RESPONSE_LENGTH: 1000,
  IGNORE_OLD_MESSAGES: true,
  LOG_FILE: 'message_logs.txt'
};

// লগিং সিস্টেম
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  fs.appendFile(CONFIG.LOG_FILE, logEntry, (err) => {
    if (err) console.error('লগিং এ সমস্যা:', err);
  });
  
  console.log(logEntry.trim());
}

// ChatGPT থেকে রিপ্লাই জেনারেট
async function generateReply(prompt) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: CONFIG.MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: CONFIG.TEMPERATURE,
        max_tokens: CONFIG.MAX_RESPONSE_LENGTH
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logMessage(`ChatGPT ত্রুটি: ${error.response?.data?.error?.message || error.message}`);
    return "দুঃখিত, আমি এখন উত্তর দিতে পারছি না।";
  }
}

// ফেসবুক লগইন এবং বট শুরু
function startBot(appState) {
  login({ appState }, (err, api) => {
    if (err) {
      logMessage(`লগইন ত্রুটি: ${err.error || err}`);
      return retryLogin();
    }

    logMessage('ফেসবুকে সফলভাবে লগইন হয়েছে!');
    
    // বট ব্যবহারকারীর তথ্য সংগ্রহ
    api.getUserInfo(api.getCurrentUserID(), (err, ret) => {
      if (!err) {
        const user = ret[api.getCurrentUserID()];
        logMessage(`বট চালু হয়েছে: ${user.name}`);
      }
    });

    // মেসেজ লিসেনার
    api.listenMqtt(async (err, event) => {
      if (err) {
        logMessage(`মেসেজ লিসেন ত্রুটি: ${err}`);
        return;
      }

      // শুধু নতুন টেক্সট মেসেজ হ্যান্ডেল করবে
      if (event.type === 'message' && event.body && event.senderID !== api.getCurrentUserID()) {
        handleNewMessage(api, event);
      }
    });
  });
}

// নতুন মেসেজ হ্যান্ডেলার
async function handleNewMessage(api, event) {
  const senderInfo = await new Promise((resolve) => {
    api.getUserInfo(event.senderID, (err, ret) => {
      resolve(err ? { name: 'অজানা ব্যবহারকারী' } : ret[event.senderID]);
    });
  });

  const logPrefix = `${senderInfo.name} (${event.senderID}) থেকে মেসেজ:`;
  logMessage(`${logPrefix} "${event.body}"`);

  try {
    const reply = await generateReply(event.body);
    
    setTimeout(() => {
      api.sendMessage(reply, event.threadID, (err) => {
        if (err) {
          logMessage(`${logPrefix} রিপ্লাই পাঠাতে ত্রুটি: ${err}`);
        } else {
          logMessage(`${logPrefix} পাঠানো রিপ্লাই: "${reply}"`);
        }
      });
    }, CONFIG.REPLY_DELAY);
  } catch (error) {
    logMessage(`${logPrefix} প্রসেসিং ত্রুটি: ${error}`);
  }
}

// লগইন রিট্রাই সিস্টেম
function retryLogin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করতে "Enter" চাপুন বা বন্ধ করতে "exit" লিখুন: ', (answer) => {
    rl.close();
    if (answer.toLowerCase() === 'exit') {
      process.exit();
    } else {
      loadAppState();
    }
  });
}

// কুকি লোড করার ফাংশন
function loadAppState() {
  try {
    const appState = require('./id.js').appState;
    if (!appState || !Array.isArray(appState)) {
      throw new Error('অবৈধ কুকি ফরম্যাট');
    }
    startBot(appState);
  } catch (err) {
    logMessage(`কুকি লোড করতে ত্রুটি: ${err.message}`);
    process.exit(1);
  }
}

// প্রোগ্রাম শুরু
logMessage('বট শুরু হচ্ছে...');
loadAppState();

// এলিগেন্ট শাটডাউন
process.on('SIGINT', () => {
  logMessage('বট বন্ধ হচ্ছে...');
  process.exit();
});
