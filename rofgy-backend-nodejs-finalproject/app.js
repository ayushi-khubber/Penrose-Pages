const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Sentiment = require('sentiment');
const getTopEmotionWords = require('./recommendations');

const app = express();
const PORT = process.env.PORT || 3000;

const sentiment = new Sentiment();


require('dotenv').config();


mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/SocialDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});


const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));


app.use(express.static(path.join(__dirname, 'public')));


function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  next();
}


function authenticateAPI(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  

  req.user = {
    userId: req.session.userId,
    username: req.session.username
  };
  
  next();
}


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/index');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/index');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/post', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));
app.get('/index', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));


app.get('/api/current-user', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      username: req.session.username,
      userId: req.session.userId 
    });
  } else {
    res.json({ username: null, userId: null });
  }
});

// User Registration
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  

  if (!username || !email || !password) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/register?error=All+fields+are+required');
    }
    return res.status(400).json({ message: 'All fields are required' });
  }
  
  if (password.length < 6) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/register?error=Password+must+be+at+least+6+characters');
    }
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/register?error=Invalid+email+format');
    }
    return res.status(400).json({ message: 'Invalid email format' });
  }
  
  try {

    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingUser) {
      const message = existingUser.username === username 
        ? 'Username already taken' 
        : 'Email already registered';
      
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/register?error=' + encodeURIComponent(message));
      }
      return res.status(400).json({ message });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ 
      username, 
      email, 
      password: hashedPassword 
    });
    
    await newUser.save();
    
    req.session.userId = newUser._id;
    req.session.username = newUser.username;
    
    const isHtmlRequest = req.headers.accept?.includes('text/html') || 
                         req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    
    if (isHtmlRequest) {

      console.log('Registration successful, redirecting to /index');
      res.redirect('/index');
    } else {

      res.status(201).json({ 
        message: 'Registration successful',
        username: newUser.username
      });
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    
    if (req.headers.accept?.includes('text/html')) {

      res.redirect('/register?error=' + encodeURIComponent('Registration failed. Please try again.'));
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// User Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/login?error=Username+and+password+required');
    }
    return res.status(400).json({ message: 'Username and password required' });
  }
  
  try {

    const user = await User.findOne({ username });
    if (!user) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/login?error=Invalid+credentials');
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/login?error=Invalid+credentials');
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    

    req.session.userId = user._id;
    req.session.username = user.username;
    

    const isHtmlRequest = req.headers.accept?.includes('text/html') || 
                         req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    
    if (isHtmlRequest) {
 
      console.log('Login successful, redirecting to /index');
      res.redirect('/index');
    } else {

      res.json({ 
        message: 'Login successful',
        username: user.username
      });
    }
    
  } catch (error) {
    console.error('Login error:', error);
    
    if (req.headers.accept?.includes('text/html')) {
      res.redirect('/login?error=' + encodeURIComponent('Login failed. Please try again.'));
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});


app.post('/post', authenticateAPI, async (req, res) => {
  const { text } = req.body;
  
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ message: 'Please provide valid post content' });
  }
  
  try {
    const newPost = new Post({ 
      userId: req.user.userId, 
      text: text.trim() 
    });
    
    await newPost.save();
    
    res.status(201).json({ 
      message: 'Post created successfully', 
      post: newPost 
    });
    
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/posts', authenticateAPI, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });
    
    res.json({ posts });
    
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.put('/posts/:postId', authenticateAPI, async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ message: 'Please provide valid post content' });
  }
  
  try {
    const post = await Post.findOneAndUpdate(
      { _id: postId, userId: req.user.userId },
      { text: text.trim() },
      { new: true, runValidators: true }
    );
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found or unauthorized' });
    }
    
    res.json({ 
      message: 'Post updated successfully', 
      updatedPost: post 
    });
    
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.delete('/posts/:postId', authenticateAPI, async (req, res) => {
  const { postId } = req.params;
  
  try {
    const post = await Post.findOneAndDelete({ 
      _id: postId, 
      userId: req.user.userId 
    });
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found or unauthorized' });
    }
    
    res.json({ 
      message: 'Post deleted successfully', 
      deletedPost: post 
    });
    
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/analyze', authenticateAPI, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.user.userId });
    
    if (!posts || posts.length === 0) {
      return res.json({
        totalEntries: 0,
        averageSentiment: 0,
        frequentWords: {},
        recommendations: {
          books: [],
          meditations: [],
          quotes: []
        }
      });
    }
    
    let emotions = {};
    let totalSentiment = 0;
    let wordCount = 0;
    
    posts.forEach(post => {
      const result = sentiment.analyze(post.text);
      totalSentiment += result.score;
      
     
      result.words.forEach(word => {
        const cleanWord = word.toLowerCase();
        emotions[cleanWord] = (emotions[cleanWord] || 0) + 1;
        wordCount++;
      });
    });
    
    const averageSentiment = (totalSentiment / posts.length).toFixed(2);
    

    const filteredEmotions = {};
    for (const [word, count] of Object.entries(emotions)) {

      if (count >= 2) {
        filteredEmotions[word] = count;
      }
    }
    
    const recommendations = getTopEmotionWords(filteredEmotions);
    
    res.json({
      totalEntries: posts.length,
      averageSentiment,
      frequentWords: filteredEmotions,
      recommendations
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/anxiety.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'anxiety.html')));
app.get('/depression.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'depression.html')));
app.get('/burnout.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'burnout.html')));

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Logout failed' });
    }
    
    res.clearCookie('connect.sid');
    

    if (req.headers.accept?.includes('application/json')) {
      res.json({ message: 'Logged out successfully' });
    } else {
      res.redirect('/login');
    }
  });
});


app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});


app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});


app.use((req, res) => {
  if (req.headers.accept?.includes('text/html')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Server URL: http://localhost:${PORT}`);
});
