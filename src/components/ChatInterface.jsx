import { useState, useRef, useEffect } from 'react';
import { chatWithZina, saveToSheet, getWeeklyWorkouts } from '../services/aiService';
import { Send, RefreshCw } from 'lucide-react';
import './ChatInterface.css';

export default function ChatInterface({ userProfile }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `היי ${userProfile.name}! אני זינה. ${userProfile.gender === 'זכר' ? 'ספר' : 'ספרי'} לי מה אכלת עכשיו או מה האימון שעשית.` }
  ]);
  const [input, setInput] = useState('');
  const [consumedCalories, setConsumedCalories] = useState(0);
  const [burnedCalories, setBurnedCalories] = useState(0);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [userPreferences, setUserPreferences] = useState(localStorage.getItem(`user_preferences_${userProfile.name}`) || '');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const fetchWorkouts = async () => {
      const count = await getWeeklyWorkouts(userProfile.name);
      setWeeklyWorkouts(count);
    };
    
    // Daily Reset/Restore Logic
    const today = new Date().toLocaleDateString();
    const savedData = JSON.parse(localStorage.getItem('zina_daily_stats') || '{}');
    
    if (savedData.date === today) {
      setConsumedCalories(Number(savedData.consumed || 0));
      setBurnedCalories(Number(savedData.burned || 0));
    } else {
      // New day, reset LocalStorage
      localStorage.setItem('zina_daily_stats', JSON.stringify({ date: today, consumed: 0, burned: 0 }));
    }

    fetchWorkouts();
  }, [userProfile.name]);

  // Persist stats whenever they change
  useEffect(() => {
    const today = new Date().toLocaleDateString();
    localStorage.setItem('zina_daily_stats', JSON.stringify({
      date: today,
      consumed: consumedCalories,
      burned: burnedCalories
    }));
  }, [consumedCalories, burnedCalories]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isCooldown) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const { cleanText, data } = await chatWithZina(userMessage, userProfile, consumedCalories, messages, userPreferences);
      
      setMessages(prev => [...prev, { role: 'assistant', text: cleanText }]);
      
      if (data) {
        // Separate logic for preferences
        if (data.preference_update) {
          const updated = (userPreferences + " " + data.preference_update).trim().slice(-500);
          setUserPreferences(updated);
          localStorage.setItem(`user_preferences_${userProfile.name}`, updated);
        }

        // Separate logic for logging
        if (data.status === 'complete') {
          const calories = Number(data.calories || 0);
          
          if (data.type === 'food') {
            setConsumedCalories(prev => prev + calories);
          } else if (data.type === 'workout') {
            setBurnedCalories(prev => prev + calories);
            setWeeklyWorkouts(prev => prev + 1);
          }

          // Database sync
          await saveToSheet(data, userProfile);
        }
      }

    } catch (error) {
      const errorMsg = error.message === 'RATE_LIMIT' 
        ? 'זינה צריכה רגע לנשום. נסי שוב בעוד כמה שניות.'
        : `אוי, משהו השתבש בחיבור לזינה. נסי שוב בעוד כמה שניות.`;
      setMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
    } finally {
      setIsLoading(false);
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 3000);
    }
  };

  const progressPercentage = Math.min((consumedCalories / userProfile.calorieBudget) * 100, 100);
  const isOverBudget = consumedCalories > userProfile.calorieBudget;
  const isWarningMode = progressPercentage >= 75;

  let progressColor = '#10b981'; // Green
  if (progressPercentage >= 85) {
    progressColor = '#ef4444'; // Red
  } else if (isWarningMode) {
    progressColor = '#f59e0b'; // Orange
  }

  const handleResetProfile = (e) => {
    e.preventDefault();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  return (
    <div className="chat-interface">
      {/* Header & Progress Bar */}
      <header className="chat-header">
        <div className="header-info">
          <h2>זינה AI</h2>
          <div className="stats-container">
            <span className={`calories-text ${isWarningMode ? 'warning-text' : ''}`}>
              {Math.max(0, Number(userProfile.calorieBudget) - Number(consumedCalories))} קק"ל נותרו
            </span>
            <span className="workout-text">
              אימונים השבוע: {weeklyWorkouts}/3 {weeklyWorkouts >= 3 && '⭐ VIP'}
            </span>
            <button 
              onClick={handleResetProfile} 
              className="reset-btn" 
              title="איפוס פרופיל"
              style={{ cursor: 'pointer', pointerEvents: 'auto', position: 'relative', zIndex: 999 }}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
        <div className="progress-bar-container">
          <div
            className={`progress-bar ${isOverBudget ? 'over-budget' : ''}`}
            style={{ width: `${progressPercentage}%`, backgroundColor: progressColor }}
          />
        </div>
        {burnedCalories > 0 && (
          <div className="bonus-deficit">
            בונוס גירעון (אימון): {burnedCalories} קק"ל 🔥
          </div>
        )}
      </header>

      {/* Messages Area */}
      <main className="messages-area">
        {messages.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.role}`}>
            <div className="message-bubble">
              <div className="zina-speech">
                {(msg.text || '').split('\n').map((line, i) => (
                  <span key={i}>{line}<br /></span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message-wrapper assistant">
            <div className="message-bubble loading">זינה מקלידה...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>
      <footer className="chat-input-area">
        <form onSubmit={handleSend}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isCooldown ? "ממתין 3 שניות (הגנת API)..." : "מה אכלת הרגע?..."}
            disabled={isLoading || isCooldown}
          />
          <button type="submit" disabled={isLoading || isCooldown || !input.trim()}>
            <Send size={20} />
          </button>
        </form>
      </footer>
    </div>
  );
}
