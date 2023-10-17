const express = require('express');
const app = express();
const port = 4000;

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const session = require('express-session');
const crypto = require('crypto');
const serviceAccount = require('./Key.json');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');


initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();


const secretKey = crypto.randomBytes(32).toString('hex');


app.use(
  session({
    secret: secretKey,
    resave: false,
    saveUninitialized: true,
  })
);


app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
  
  const user = req.session.user;
  if (user) {
    res.render('pages/home', { user });
  } else {
    res.redirect('/login');
  }
});
app.get('/shop', (req, res) => {
  const user = req.session.user;
  res.render('pages/shop');
});



app.get('/signup', (req, res) => {
  res.render('pages/signup');
});

app.post('/signupsubmit', async (req, res) => {
    const FullName = req.body.FullName;
    const Email = req.body.Email;
    const Password = req.body.Password;
  
    try {
      
      const emailExists = await checkEmailExists(Email);
  
      if (emailExists) {
        
        return res.send('Signup Failed: Email address already in use.');
      }
  
      
      const hashedPassword = await hashPassword(Password);
  
      
      const user = {
        FullName: FullName,
        Email: Email,
        Password: hashedPassword,
        
      };
  
    
      await addUserToDatabase(user);
  
      
      req.session.user = user;
      res.redirect('/');
    } catch (error) {
      console.error('Error during signup:', error);
      res.send('An error occurred during signup.');
    }
  });
  
  // Function to check if an email exists in the database
  async function checkEmailExists(Email) {
    const snapshot = await db.collection('userDetails').where('Email', '==', Email).get();
    return !snapshot.empty;
  }
  
  // Function to hash a password using bcrypt
  async function hashPassword(password) {
    const saltRounds = 10; 
    return bcrypt.hash(password, saltRounds);
  }
  
  // Function to add a user to the database
  async function addUserToDatabase(user) {
    await db.collection('userDetails').add(user);
  }
  
  

app.get('/login', (req, res) => {

  const user = req.session.user;
  if (user) {
    res.redirect('/');
  } else {
    res.render('pages/login');
  }
});

app.post('/loginsubmit', async (req, res) => {
    const Email = req.body.Email;
    const Password = req.body.Password;
  
    try {

      const userSnapshot = await db.collection('userDetails').where('Email', '==', Email).get();
  
      if (userSnapshot.empty) {
        
        return res.send('Login Failed: User not found.');
      }
  
      
      let userData;
      userSnapshot.forEach((doc) => {
        userData = doc.data();
      });
  
      const hashedPassword = userData.Password;
  
      
      const passwordMatch = await comparePasswords(Password, hashedPassword);
  
      if (passwordMatch) {
        
        req.session.user = userData;
        return res.redirect('/');
      } else {
        
        return res.send('Login Failed: Incorrect password.');
      }
    } catch (error) {
      console.error('Error during login:', error);
      res.send('An error occurred during login.');
    }
  });
  
  
  async function comparePasswords(enteredPassword, hashedPassword) {
    return bcrypt.compare(enteredPassword, hashedPassword);
  }
  
  

app.get('/profile', (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.redirect('/login');
  }

  res.render('pages/profile', { user });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/login');
  });
});
// Express.js route to add items to the cart
app.post('/add-to-cart', async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.send('Please log in to add items to your cart.');
  }

  const userEmail = user.Email; // Use the user's email as the identifier

  // Extract product details from the request, including product_id, product_name, and image_url.
  const { product_id, product_name,price, image_url } = req.body;

  // Create a reference to the cart items collection for the user
  const cartItemsCollection = db.collection('cartItems');

  // Define the cart item data
  const cartItemData = {
    userEmail, // Use the user's email
    product_id,
    product_name,
    price: parseFloat(price),
    image_url,
  };

  try {
    // Add the cart item to Firestore
    await cartItemsCollection.add(cartItemData);

    // You can also show an alert message to indicate that the item was added successfully
    res.send('Item added to cart successfully');
  } catch (error) {
    console.error('Error adding item to cart:', error);
    res.status(500).send('Error adding item to cart');
  }
});

// Express.js route for the cart page
// Express.js route for the cart page
app.get('/cart', async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.redirect('/login');
  }

  try {
    // Fetch cart items for the user
    const userEmail = user.Email; // Use the user's email as the identifier
    const cartItemsSnapshot = await db.collection('cartItems').where('userEmail', '==', userEmail).get();
    const cartItems = cartItemsSnapshot.docs.map((doc) => doc.data());
    const totalPrice = cartItems.reduce((total, item) => total + item.price, 0);


    res.render('pages/cart', { user, cartData: cartItems, totalPrice }); // Pass cartItems as cartData to the template
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.send('An error occurred while fetching cart items.');
  }
});
// Express.js route for clearing the cart
app.post('/clear-cart', async (req, res) => {
  const user = req.session.user;

  if (!user) {
      return res.redirect('/login');
  }

  try {
      const userEmail = user.Email; // Use the user's email as the identifier

      // Delete all cart items for the user
      const cartItemsSnapshot = await db.collection('cartItems').where('userEmail', '==', userEmail).get();
      
      const deletePromises = [];
      cartItemsSnapshot.forEach((doc) => {
          const deletePromise = doc.ref.delete();
          deletePromises.push(deletePromise);
      });

      // Wait for all delete operations to complete
      await Promise.all(deletePromises);

      res.send('Cart cleared successfully');
  } catch (error) {
      console.error('Error clearing cart:', error);
      res.send('An error occurred while clearing the cart.');
  }
});
app.post('/buy-now', async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.redirect('/login');
  }

  try {
    
    const cartItemsSnapshot = await db.collection('cartItems').where('userEmail', '==', user.Email).get();
    const deletePromises = [];

    cartItemsSnapshot.forEach((doc) => {
      const deletePromise = doc.ref.delete();
      deletePromises.push(deletePromise);
    });

    
    await Promise.all(deletePromises);

    
    res.send('Contact the designer through email jkns@gmail.com for further requirements and order details. Thank You! For Visiting');
  } catch (error) {
    console.error('Error processing purchase:', error);
    res.send('An error occurred while processing the purchase.');
  }
});




app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
