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
      // Build a daily summary for context memory
      const dailySummary = `Logged today: Consumed ${consumedCalories} kcal, Burned ${burnedCalories} kcal.`;
      const response = await chatWithZina(userMessage, userProfile, consumedCalories, weeklyWorkouts, messages, userPreferences);
      
      const assistantMsg = {
        role: 'assistant',
        text: response.zina_speech,
        action: response.action,
        data: response.extracted_data
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      if (response.new_preferences) {
        const updatedPrefs = (userPreferences + " " + response.new_preferences).trim();
        setUserPreferences(updatedPrefs);
        localStorage.setItem(`user_preferences_${userProfile.name}`, updatedPrefs);
      }
      
      if (response.is_final_report && response.action && response.extracted_data) {
        let calories = 0;
        let protein = 0;
        let calories_burned = 0;
        let itemName = response.extracted_data.item || response.extracted_data.activity || 'Unknown';

        if (response.action === 'food') {
          calories = Number(response.extracted_data.calories || 0);
          protein = Number(response.extracted_data.protein || 0);
          setConsumedCalories(prev => Number(prev) + calories);
        }
        
        if (response.action === 'workout') {
          const duration = Number(response.extracted_data.duration || 0);
          const activity = (response.extracted_data.activity || '').toLowerCase();
          
          // Official Workout Price List
          if (activity.includes('הליכה')) {
            calories_burned = duration * 3;
          } else if (activity.includes('אירובי')) {
            calories_burned = duration * 7;
          } else if (activity.includes('כוח') || activity.includes('בטן')) {
            calories_burned = duration * 4;
          } else {
            calories_burned = duration * 5; // Default
          }
          
          setBurnedCalories(prev => Number(prev) + calories_burned);
          setWeeklyWorkouts(prev => Number(prev) + 1);
        }
        
        // Immediate database sync - ONLY on final report
        await saveToSheet({
          name: userProfile.name,
          action: response.action,
          item: itemName,
          calories,
          protein,
          calories_burned
        });
      }
    } catch (error) {
      const errorMsg = error.message === 'RATE_LIMIT' 
        ? 'זינה בטעינה... נסה שוב בעוד 30 שניות.'
        : `אוי, משהו השתבש: ${error.message}. נסי שוב מאוחר יותר.`;
      setMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
    } finally {
      setIsLoading(false);
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 3000);
    }
  };

  const progressPercentage = Math.min((consumedCalories / userProfile.calorieBudget) * 100, 100);
  const isOverBudget = consumedCalories > userProfile.calorieBudget;

  let progressColor = '#10b981'; // Green
  if (progressPercentage >= 85) {
    progressColor = '#ef4444'; // Red
  } else if (progressPercentage >= 50) {
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
            <span className="calories-text">
              {Number(userProfile.calorieBudget) - Number(consumedCalories)} קק"ל נותרו
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
