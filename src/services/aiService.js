import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const buildSystemPrompt = (userProfile, lifestyle, userPreferences = "") => {
  const gender = userProfile.gender === 'זכר' ? 'MASCULINE' : 'FEMININE';
  
  return `Act as Zina, a smart and ruthless Israeli prison guard nutritionist. Address the user (${userProfile.name}) in SHARP, NATURAL NATIVE HEBREW (${gender} ONLY).

USER PERMANENT PROFILE:
${userPreferences || "None yet."}

WORKOUT PRICE LIST (For your speech ONLY):
- Walking: 3 kcal/min.
- Aerobic: 7 kcal/min.
- Strength/Core: 4 kcal/min.
- Default: 5 kcal/min.

RULES:
1. DYNAMIC GREETINGS (WORKOUT): Look at the chat history. Only use "עוד אימון?" if a workout was logged in the last 4 messages. Otherwise, use "אימון? סוף סוף את מזיזה את עצמך!" or "ספרי לי על האימון".
2. VISUALIZE MATH: Mention the calories burned in zina_speech using the Price List. (e.g., "40 דקות אירובי? זה 280 קלוריות ששרפת. תמשיכי ככה!").
3. NO REPETITION: If the user is just providing a missing quantity (e.g., "100 grams"), do NOT repeat your whole intro. Say "עודכן" or "נרשם" and show the values.
4. FINAL REPORT LOGIC: Only set is_final_report=true if you have BOTH item/activity AND specific quantity. 
5. WORKOUT SENTIMENT: Never call the user "פופוטם" for exercising. Be tough but encouraging.
6. METABOLIC ROAST: For junk, explain metabolic damage.
7. NO MATH FOR DB: Extract activity and duration. The system handles the final calculation.

JSON ONLY:
{
  "zina_speech": "Hebrew text",
  "extracted_data": { 
    "item": "string", 
    "calories": number, 
    "protein": number,
    "activity": "string",
    "duration": number
  },
  "is_final_report": boolean,
  "new_preferences": "string",
  "action": "food" | "workout" | "none"
}

Context: Weakness=${lifestyle.weakness || 'None'}`;
};

export const chatWithZina = async (message, userProfile, currentCalories, weeklyWorkouts = 0, chatHistory = [], userPreferences = "") => {
  if (!GROQ_API_KEY) throw new Error("Missing Groq API Key");

  const lifestyle = JSON.parse(localStorage.getItem('lifestyleContext') || '{}');
  const systemPrompt = buildSystemPrompt(userProfile, lifestyle, userPreferences);

  const history = chatHistory
    .slice(-5)
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.text || (msg.zina_speech || JSON.stringify(msg))
    }));

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7
  };

  try {
    const response = await axios.post(GROQ_ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.choices[0].message.content;
    const parsed = JSON.parse(result);
    
    if (parsed.extracted_data) {
      parsed.extracted_data.calories = Number(parsed.extracted_data.calories || 0);
      parsed.extracted_data.calories_burned = Number(parsed.extracted_data.calories_burned || 0);
      parsed.extracted_data.protein = Number(parsed.extracted_data.protein || 0);
      parsed.extracted_data.duration = Number(parsed.extracted_data.duration || 0);
    }

    return parsed;
  } catch (error) {
    console.error("Groq Error:", error.response?.data || error.message);
    if (error.response?.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`שגיאת שרת: ${error.message}`);
  }
};

export const saveToSheet = async (data) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  const isProfile = !!data.calorieBudget;
  if (!GOOGLE_SHEETS_URL) return;
  if (!isProfile && (!data.action || data.action === 'none')) return;

  const payload = isProfile ? {
    name: data.name,
    gender: data.gender,
    calorieBudget: data.calorieBudget
  } : {
    date: new Date().toISOString(),
    name: data.name,
    action_type: data.action,
    food_item: data.item || data.activity,
    calories: Number(data.calories || 0),
    protein: Number(data.protein || 0),
    calories_burned: Number(data.calories_burned || 0)
  };

  try {
    await axios.post(GOOGLE_SHEETS_URL, JSON.stringify(payload), {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  } catch (error) { console.error("Sheets Error:", error); }
};

export const getWeeklyWorkouts = async (userName) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  if (!GOOGLE_SHEETS_URL) return 0;
  try {
    const res = await axios.get(`${GOOGLE_SHEETS_URL}?sheet=Log`);
    const data = res.data;
    if (!Array.isArray(data)) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return data.filter(row => {
      const rowDate = new Date(row.Date || row.date);
      const isUser = (row.Name || row.name) === userName;
      const burned = parseFloat(row.CaloriesBurned || row.calories_burned || 0);
      return rowDate >= sevenDaysAgo && isUser && burned > 0;
    }).length;
  } catch { return 0; }
};
