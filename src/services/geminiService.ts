import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getApiKey = () => {
  const key = process.env.gemini_api_key2 || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!key || key === "undefined") {
    console.warn("Gemini API Key not found. Please ensure 'gemini_api_key2' or 'GEMINI_API_KEY' is set in the Secrets panel.");
    return "";
  }
  return key;
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes("429") || error.message?.includes("quota"))) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const HARDCODED_JOKES = [
  "What do you call a bear with no teeth? A gummy bear! 🐻🍭",
  "Why did the mushroom go to the party? Because he was a fun-gi! 🍄🎉",
  "What do you call a sleeping dinosaur? A dino-snore! 🦖💤",
  "Why did the student eat his homework? Because the teacher said it was a piece of cake! 🍰📚",
  "What is orange and sounds like a parrot? A carrot! 🥕🦜",
  "How do you make a tissue dance? Put a little boogey in it! 💃🤧",
  "Why was the math book sad? It had too many problems! 📘😢"
];

const HARDCODED_REASONS: Record<string, string[]> = {
  'HAPPY': [
    'I got a new toy',
    'I ate my favorite food',
    'I played with my friends'
  ],
  'SAD': [
    'Someone took my toy',
    'I dropped my snack',
    'I miss my parent'
  ],
  'ANGRY': [
    'I lost the game',
    'It is not fair',
    'I do not want to'
  ],
  'CONFUSED': [
    'I do not understand',
    'What is happening now',
    'The rules changed'
  ],
  'TIRED': [
    'I played too much',
    'I woke up early',
    'I need a nap'
  ],
  'HUNGRY': [
    'It is time for lunch',
    'I want a snack',
    'My tummy is rumbling'
  ]
};

const HARDCODED_ACTIONS: Record<string, string[]> = {
  'HAPPY': [
    'Smile and clap hands',
    'Share with a friend',
    'Draw a happy picture'
  ],
  'SAD': [
    'Ask for a hug',
    'Take deep breaths',
    'Hold a comfort toy'
  ],
  'ANGRY': [
    'Count to ten perfectly',
    'Squeeze a stress ball',
    'Walk away to cool down'
  ],
  'CONFUSED': [
    'Ask the teacher for help',
    'Look at the visual schedule',
    'Wait and watch others'
  ],
  'TIRED': [
    'Rest your head down',
    'Drink some cold water',
    'Read a quiet book'
  ],
  'HUNGRY': [
    'Eat my packed snack',
    'Ask for some food',
    'Drink some water first'
  ]
};

export async function generateReasons(emotion: string): Promise<string[]> {
  const upperEmotion = emotion.toUpperCase();
  return HARDCODED_REASONS[upperEmotion] || [
    'Something happened',
    'I do not know',
    'Just feeling this way'
  ];
}

export async function generateActions(emotion: string, reason: string): Promise<string[]> {
  const upperEmotion = emotion.toUpperCase();
  return HARDCODED_ACTIONS[upperEmotion] || [
    'Take a deep breath',
    'Ask for help',
    'Drink some water'
  ];
}

const IMAGE_MAPPING: Record<string, string> = {
  // Reasons
  'I got a new toy': new URL('../reason_images/happy_new_toy.png', import.meta.url).href,
  'I ate my favorite food': new URL('../reason_images/happy_favourite_food.png', import.meta.url).href,
  'I played with my friends': new URL('../reason_images/happy_play_friends.png', import.meta.url).href,
  'Someone took my toy': new URL('../reason_images/sad_toy_taken.png', import.meta.url).href,
  'I dropped my snack': new URL('../reason_images/sad_dropped_snack.png', import.meta.url).href,
  'I miss my parent': new URL('../reason_images/sad_miss_parent.png', import.meta.url).href,
  'I lost the game': new URL('../reason_images/angry_lost_game.png', import.meta.url).href,
  'It is not fair': new URL('../reason_images/angry_not_fair.png', import.meta.url).href,
  'I do not want to': new URL('../reason_images/angry_dont_want.png', import.meta.url).href,
  'I do not understand': new URL('../reason_images/confused_dont_understand.png', import.meta.url).href,
  'What is happening now': new URL('../reason_images/confused_what_happening.png', import.meta.url).href,
  'The rules changed': new URL('../reason_images/confused_rules_changed.png', import.meta.url).href,
  'I played too much': new URL('../reason_images/tired_played_much.png', import.meta.url).href,
  'I woke up early': new URL('../reason_images/tired_woke_up_early.png', import.meta.url).href,
  'I need a nap': new URL('../reason_images/tired_need_nap.png', import.meta.url).href,
  'It is time for lunch': new URL('../reason_images/hungry_lunch.png', import.meta.url).href,
  'I want a snack': new URL('../reason_images/hungry_snack.png', import.meta.url).href,
  'My tummy is rumbling': new URL('../reason_images/hungry_tummy.png', import.meta.url).href,

  // Actions
  'Smile and clap hands': new URL('../actions_images/happy_clap_hands.png', import.meta.url).href,
  'Share with a friend': new URL('../actions_images/happy_share_friends.png', import.meta.url).href,
  'Draw a happy picture': new URL('../actions_images/happy_draw.png', import.meta.url).href,
  'Ask for a hug': new URL('../actions_images/sad_hug.png', import.meta.url).href,
  'Take deep breaths': new URL('../actions_images/sad_deep_breaths.png', import.meta.url).href,
  'Hold a comfort toy': new URL('../actions_images/sad_toy.png', import.meta.url).href,
  'Count to ten perfectly': new URL('../actions_images/angry_count.png', import.meta.url).href,
  'Squeeze a stress ball': new URL('../actions_images/angry_stress_ball.png', import.meta.url).href,
  'Walk away to cool down': new URL('../actions_images/angry_cool_down.png', import.meta.url).href,
  'Ask the teacher for help': new URL('../actions_images/confused_ask_teacher.png', import.meta.url).href,
  'Look at the visual schedule': new URL('../actions_images/confused_look_schedule.png', import.meta.url).href,
  'Wait and watch others': new URL('../actions_images/confused_wait.png', import.meta.url).href,
  'Rest your head down': new URL('../actions_images/tired_rest_head.png', import.meta.url).href,
  'Drink some cold water': new URL('../actions_images/tired_drink_water.png', import.meta.url).href,
  'Read a quiet book': new URL('../actions_images/tired_read_book.png', import.meta.url).href,
  'Eat my packed snack': new URL('../actions_images/hungry_eat_snack.png', import.meta.url).href,
  'Ask for some food': new URL('../actions_images/hungry_ask_food.png', import.meta.url).href,
  'Drink some water first': new URL('../actions_images/hungry_drink_water.png', import.meta.url).href,
};

export async function generateImage(prompt: string): Promise<string> {
  if (IMAGE_MAPPING[prompt]) {
    return IMAGE_MAPPING[prompt];
  }
  return withRetry(async () => {
    // Step 1: Generate a concise visual description for the image model
    const textModel = "gemini-3-flash-preview";
    const promptResponse = await ai.models.generateContent({
      model: textModel,
      contents: `Describe a very literal, 1-sentence situation of a child for a flat vector illustration.
      Input: "${prompt}"
      If it says "Someone took my toy", describe "Two children, one crying while the other holds a toy rocket." 
      If it says "I lost the game", describe "A child sitting sadly next to a board game."
      Focus purely on the physical situation. No abstract emotions.
      Output: [Visual Description]`,
    });

    const visualPrompt = promptResponse.text?.replace(/\[Visual Description\]:?/i, '').trim() || prompt;

    // Step 2: Generate the image using the refined visual prompt
    const imageModel = "gemini-2.5-flash-image";
    const response = await ai.models.generateContent({
      model: imageModel,
      contents: {
        parts: [
          {
            text: `A 2D flat vector cartoon illustration showing: ${visualPrompt}. 
          Style: cute children's book illustration, clean thin black outlines, flat cheerful colors, pure white background, no shading, no 3D elements, no text. 
          The drawing should look like a simple digital sticker on a white background.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned");
  }).catch(error => {
    console.error("Image generation failed:", error);
    // Return a clean cartoon placeholder image instead of random photography when API rate-limits
    return `https://raw.githubusercontent.com/ngaio01/bridge/main/placeholder_cartoon.png`;
  });
}

export async function generateDailySummary(studentName: string, logs: any[]) {
  const model = "gemini-2.5-flash";
  const logsText = logs.map(l => `${l.emotion}: ${l.reason}`).join(", ");
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Summarize the day for ${studentName} based on these logs: ${logsText}. The summary is for their parents. Be supportive, clear, and high-level. Keep it under 50 words. Example style: "Emma had a mostly positive day. She felt overwhelmed once during group activity but felt better after taking a quiet break."`,
      });
      return response.text;
    } catch (error: any) {
      console.error("Error generating daily summary. Full error:", error);
      if (error.status) console.error("Status:", error.status);
      if (error.message) console.error("Message:", error.message);
      return "Unable to generate summary at this time.";
    }
  });
}
export async function refineReason(emotion: string, input: string): Promise<string[]> {
  const model = "gemini-2.5-flash";
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `The student feels ${emotion} and said: "${input}". 
        Suggest 2 short, child-friendly reasons (under 7 words each) that explain why they might feel this way based on their input. 
        Return ONLY the 2 reasons separated by a pipe character (|).
        Example: I am hungry | I want a snack`,
      });
      const text = response.text || "";
      return text.split('|').map(s => s.trim()).filter(s => s.length > 0).slice(0, 2);
    } catch (error: any) {
      console.error("Error refining reason:", error);
      return [input, `Feeling ${emotion}`]; // Fallback
    }
  });
}

export async function getChatResponse(history: { role: 'user' | 'model', parts: { text: string }[] }[]): Promise<string> {
  const model = "gemini-2.5-flash"; // Use working model from other functions
  return withRetry(async () => {
    try {
      const historyText = history.map(h => `${h.role === 'user' ? 'Child' : 'Friend'}: ${h.parts[0].text}`).join("\n");

      const response = await ai.models.generateContent({
        model,
        contents: `Role: A supportive, calming companion (Friend) for a child (approx 5-10 yrs old) waiting for their teacher.
Tone: Playful, encouraging, simple, and very child-friendly.
Goal: Keep the child calm and distracted. Tell short jokes, stories, or breathing exercises.

CRITICAL INSTRUCTIONS:
- ONLY output the new response for "Friend".
- DO NOT repeat the "Child" message.
- DO NOT repeat previous "Friend" messages from the history.
- If the child asks for a joke, TELL A NEW JOKE.
- Keep the response short (15-40 words).
- Use lots of emojis! 🌈✨🌟

Conversation History:
${historyText}

Friend:`,
      });

      const text = response.text || "";
      console.log("Chat response raw:", text);

      // Basic cleanup in case the model repeats the prefix
      return text.replace(/^Friend:\s*/i, "").trim() || "I'm right here with you! Your teacher is coming soon. 🌟";
    } catch (error: any) {
      console.error("Error getting chat response:", error);
      // Pick a random joke from fallback list if API fails
      const randomJoke = HARDCODED_JOKES[Math.floor(Math.random() * HARDCODED_JOKES.length)];
      return `I'm right here with you! Your teacher is coming soon. 🌟 ${randomJoke}`;
    }
  });
}
