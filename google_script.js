/**
 * קוד זה מיועד ל-Google Apps Script.
 * יש ליצור פרויקט חדש ב-Google Sheets (דרך הרחבות -> Apps Script),
 * להדביק את הקוד הזה, ואז לבצע Deploy כ-Web App.
 * יש להקפיד ליצור 2 גיליונות (Tabs) בקובץ ה-Sheets:
 * 1. Log - עם עמודות (Date, Name, Action Type, Food Item, Calories, Protein, CaloriesBurned)
 * 2. Users - עם עמודות (Date, Name, Gender, Calorie Budget)
 */

function doPost(e) {
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    
    // פענוח נתוני ה-JSON שהתקבלו
    var data = JSON.parse(e.postData.contents);
    
    // ניתוב הנתונים לפי סוג (אם יש action_type או food_item - זה לוג)
    if (data.action_type || data.food_item) {
      var sheet = doc.getSheetByName("Log");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Log sheet not found"})).setMimeType(ContentService.MimeType.JSON);
      
      sheet.appendRow([
        data.date || new Date().toISOString(),
        data.name || "",
        data.action_type || "",
        data.food_item || "",
        data.calories || 0,
        data.protein || 0,
        data.calories_burned || 0
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({status: "success", type: "log"})).setMimeType(ContentService.MimeType.JSON);
    } 
    // אם יש תקציב קלוריות - זוהי שמירת פרופיל משתמש
    else if (data.calorieBudget || data.gender) {
      var sheet = doc.getSheetByName("Users");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Users sheet not found"})).setMimeType(ContentService.MimeType.JSON);
      
      sheet.appendRow([
        new Date().toISOString(),
        data.name || "",
        data.gender || "",
        data.calorieBudget || 0
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({status: "success", type: "user"})).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({error: "Unknown data format"})).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    
    // משיכת פרמטר מכתובת ה-URL כדי לדעת איזה גיליון להחזיר (למשל ?sheet=Users)
    // ברירת מחדל: גיליון Log
    var sheetName = (e.parameter && e.parameter.sheet) ? e.parameter.sheet : "Log"; 
    var sheet = doc.getSheetByName(sheetName);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({error: "Sheet not found"})).setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      // אם יש רק כותרות או שהגיליון ריק
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = data[0];
    var rows = data.slice(1);
    
    var jsonArray = rows.map(function(row) {
      var obj = {};
      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });
      return obj;
    });
    
    return ContentService.createTextOutput(JSON.stringify(jsonArray)).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
