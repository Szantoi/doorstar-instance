const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');

const apiKey = 'AIzaSyAmVVu7TvjuZiAII2kYZkgVKhGHmhUH1Xk';

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey,
  modelName: 'gemini-embedding-001',
});

embeddings.embedDocuments(['test text 1', 'test text 2'])
  .then(result => {
    console.log('Success! Embeddings:', result.length, 'vectors');
    console.log('First embedding length:', result[0]?.length);
    console.log('First 5 dims:', result[0]?.slice(0, 5));
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error('Full error:', err);
  });
