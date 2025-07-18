require('dotenv').config();
const login = require('facebook-chat-api');
const axios = require('axios');
const { appState } = require('./id');

// Check if API key exists
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is missing in .env file');
  process.exit(1);
}

// Initialize Facebook connection
login({ appState }, (err, api) => {
  if (err) {
    console.error('Facebook login error:', err);
    return;
  }

  console.log('Successfully logged in to Facebook!');

  // Listen for messages
  api.listenMqtt(async (err, event) => {
    if (err) {
      console.error('Message listener error:', err);
      return;
    }

    // Only respond to new text messages from others
    if (event.type === 'message' && event.body && event.senderID !== api.getCurrentUserID()) {
      console.log(`New message from ${event.senderID}: ${event.body}`);
      
      try {
        // Get ChatGPT response
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: event.body }],
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const reply = response.data.choices[0].message.content;
        
        // Send reply after short delay
        setTimeout(() => {
          api.sendMessage(reply, event.threadID, (err) => {
            if (err) console.error('Send error:', err);
            else console.log(`Reply sent: ${reply.substring(0, 50)}...`);
          });
        }, 1500);

      } catch (error) {
        console.error('ChatGPT error:', error.response?.data || error.message);
        api.sendMessage("I'm having trouble responding right now.", event.threadID);
      }
    }
  });
});
