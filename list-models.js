import axios from 'axios';
import fs from 'fs';

// Read .env file manually since import.meta is not available here
const envContent = fs.readFileSync('.env', 'utf-8');
const match = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const API_KEY = match ? match[1].trim() : '';

async function listModels() {
  console.log("Using API_KEY ending with: " + API_KEY.slice(-4));
  try {
    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    console.log("AVAILABLE MODELS:");
    response.data.models.forEach(m => {
      console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (error) {
    console.error("ERROR LISTING MODELS:", error.response ? error.response.data : error.message);
  }
}

listModels();
