const recommendations = {
  sad: {
    books: ["The Comfort Book – Matt Haig", "Reasons to Stay Alive – Matt Haig"],
    meditations: ["https://youtu.be/inpok4MKVLM", "https://youtu.be/EKkUtrL6B18"],
    quotes: ["These difficult days won't consume your whole existence"]
  },
  happy: {
    books: ["The Alchemist – Paulo Coelho", "Big Magic – Elizabeth Gilbert"],
    meditations: ["https://youtu.be/ZToicYcHIOU"],
    quotes: ["Yay! You deserve to be in spaces that let you shine :D"]
  },
  anxious: {
    books: ["The Power of Now – Eckhart Tolle"],
    meditations: ["https://youtu.be/O-6f5wQXSu8", "https://youtu.be/uUIGKhG_Vq8"],
    quotes: ["Reminder that you are capable of surviving discomfort! What if it all works out better than you expected it to?"]
  }
};

function getTopEmotionWords(frequentWords) {
  const emotionKeywords = {
  sad: ["sad", "down", "cry", "hopeless", "lonely", "depressed", "heartbroken"],
  happy: ["happy", "grateful", "excited", "joy", "content", "thrilled", "ecstatic"],
  anxious: ["anxious", "worried", "nervous", "panic", "afraid", "stressed", "tense"]
};

  const emotionScores = {
    sad: 0,
    happy: 0,
    anxious: 0
  };

  for (let word in frequentWords) {
    for (let emotion in emotionKeywords) {
      if (emotionKeywords[emotion].includes(word)) {
        emotionScores[emotion] += frequentWords[word];
      }
    }
  }

  const topEmotion = Object.entries(emotionScores).sort((a, b) => b[1] - a[1])[0][0];

  return recommendations[topEmotion] || {
    books: ["You're doing great just by showing up."],
    meditations: [],
    quotes: ["Keep going. One moment at a time."]
  };
}

module.exports = getTopEmotionWords;