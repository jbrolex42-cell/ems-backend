const axios = require('axios');

const what3wordsApiKey = process.env.WHAT3WORDS_API_KEY;

async function convertWordsToCoordinates(words) {
  const response = await axios.get(
    `https://api.what3words.com/v3/convert-to-coordinates?words=${words}&key=${what3wordsApiKey}`
  );

  return response.data;
}

module.exports = { convertWordsToCoordinates };