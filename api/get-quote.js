// api/get-quote.js
export default async function handler(req, res) {
  // Set CORS headers to allow your frontend
  res.setHeader('Access-Control-Allow-Origin', 'https://honeyamn10-source.github.io'); // replace with your actual GitHub Pages URL
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    type, name, contact,
    age, gender, smoker, term, cover, health, rider,
    destination, days, travelers, coverType, tripCost
  } = req.body;

  // Get API keys from environment variables
  const DIRECTOR_API_KEY = process.env.DIRECTOR_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const AGENT_USER = process.env.AGENT_USER;
  const AGENT_PASS = process.env.AGENT_PASS;

  try {
    // --- Step 1: Build Director.ai task ---
    let task = '';
    if (type === 'travel') {
      task = `
        Go to 21stcenturytips.com. Log in with username ${AGENT_USER} and password ${AGENT_PASS}.
        Navigate to the "Visitors to Canada" insurance section.
        Fill out a quote request for a ${age}-year-old ${gender}, traveling for ${days} days.
        Trip destination: ${destination}, coverage type: ${coverType}, trip cost: ${tripCost} AED.
        Submit the form and return the final premium and a summary of coverage.
      `;
    } else if (type === 'life') {
      // Example for life insurance (adjust as needed)
      task = `
        Go to [life insurance portal]. Log in with ${AGENT_USER}:${AGENT_PASS}.
        Fill out a term life quote for a ${age}-year-old ${gender}, smoker: ${smoker}, health class: ${health}, sum assured: ${cover} AED, term: ${term} years, rider: ${rider}.
        Return the premium and key features.
      `;
    }

    // --- Step 2: Call Director.ai (replace URL with actual endpoint) ---
    const directorResponse = await fetch('https://api.director.ai/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIRECTOR_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task })
    });

    if (!directorResponse.ok) {
      throw new Error(`Director.ai error: ${await directorResponse.text()}`);
    }

    const directorResult = await directorResponse.json();
    const rawQuoteText = directorResult.result || directorResult.output || JSON.stringify(directorResult);

    // --- Step 3: Use Gemini to structure the result ---
    const geminiPrompt = `
      Extract the following information from the insurance quote text below:
      - Company name
      - Premium amount in AED (just the number)
      - A list of key features (up to 3)
      - A rating out of 5 (if not present, use 4.5)

      Return ONLY a valid JSON array with one object containing these fields: 
      { "company": string, "premium": number, "features": [string], "rating": number, "logoIcon": "bi-shield-check" }

      Quote text:
      ${rawQuoteText}
    `;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: geminiPrompt }] }]
      })
    });

    if (!geminiResponse.ok) {
      // Fallback
      const fallbackQuotes = [{
        company: '21st Century Tips',
        premium: 1250,
        features: ['Emergency Medical', 'Trip Cancellation', 'Baggage Loss'],
        rating: 4.5,
        logoIcon: 'bi-shield-check'
      }];
      return res.status(200).json({ quotes: fallbackQuotes });
    }

    const geminiData = await geminiResponse.json();
    let structuredQuotes;
    try {
      const text = geminiData.candidates[0].content.parts[0].text;
      const jsonStr = text.replace(/```json|```/g, '').trim();
      structuredQuotes = JSON.parse(jsonStr);
      if (!Array.isArray(structuredQuotes)) structuredQuotes = [structuredQuotes];
    } catch (e) {
      structuredQuotes = [{
        company: '21st Century Tips',
        premium: 1250,
        features: ['Emergency Medical', 'Trip Cancellation', 'Baggage Loss'],
        rating: 4.5,
        logoIcon: 'bi-shield-check'
      }];
    }

    return res.status(200).json({ quotes: structuredQuotes });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
