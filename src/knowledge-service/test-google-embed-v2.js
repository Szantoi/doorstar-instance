// Google AI Studio embedding API (text-embedding-004 model)
const apiKey = 'AIzaSyAmVVu7TvjuZiAII2kYZkgVKhGHmhUH1Xk';

// Correct endpoint for newer embedding model
const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

const payload = {
  model: "models/text-embedding-004",
  content: {
    parts: [{ text: "test embedding text" }]
  }
};

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(res => res.json())
  .then(data => {
    console.log('Response keys:', Object.keys(data));
    if (data.embedding) {
      console.log('✅ Embedding length:', data.embedding.values?.length || 0);
      console.log('First 5 dims:', data.embedding.values?.slice(0, 5));
    } else if (data.error) {
      console.log('❌ Error:', data.error.message);
    }
  })
  .catch(err => console.error('Fetch error:', err.message));
