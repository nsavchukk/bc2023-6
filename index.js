const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');
const app = express();
const port = 8000;

app.use(bodyParser.json());

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'jorge',
  password: '06072004',
  database: 'devices'
});

connection.connect();

app.get('/devices', (req, res) => {
  connection.query('SELECT * FROM devices', (error, results, fields) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    res.json(results);
  });
});

app.get('/devices/:id', (req, res) => {
  const { id } = req.params;
  connection.query('SELECT * FROM devices WHERE id = ?', [id], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.status(404).send('Device not found.');
    }
  });
});

app.post('/devices', (req, res) => {
  const { device_name, description, serial_number, manufacturer } = req.body;
  connection.query('INSERT INTO devices (device_name, description, serial_number, manufacturer) VALUES (?, ?, ?, ?)', 
  [device_name, description, serial_number, manufacturer], 
  (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    res.status(201).send(`Device added with ID: ${results.insertId}`);
  });
});

app.put('/devices/:id', (req, res) => {
  const { id } = req.params;
  const { device_name, description, serial_number, manufacturer } = req.body;
  connection.query('UPDATE devices SET device_name = ?, description = ?, serial_number = ?, manufacturer = ? WHERE id = ?', 
  [device_name, description, serial_number, manufacturer, id], 
  (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.affectedRows > 0) {
      res.send('Device updated successfully.');
    } else {
      res.status(404).send('Device not found.');
    }
  });
});

app.delete('/devices/:id', (req, res) => {
  const { id } = req.params;
  connection.query('DELETE FROM devices WHERE id = ?', [id], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.affectedRows > 0) {
      res.send('Device deleted successfully.');
    } else {
      res.status(404).send('Device not found.');
    }
  });
});


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

app.post('/upload/:deviceId', upload.single('deviceImage'), (req, res) => {
  const { deviceId } = req.params;
  const filePath = req.file.path;
  connection.query('UPDATE devices SET image_path = ? WHERE id = ?', [filePath, deviceId], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.affectedRows > 0) {
      res.send(`File uploaded as ${filePath}`);
    } else {
      res.status(404).send('Device not found.');
    }
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/device-image/:deviceId', (req, res) => {
  const { deviceId } = req.params;

  connection.query('SELECT image_path FROM devices WHERE id = ?', [deviceId], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.length > 0 && results[0].image_path) {
      const imagePath = results[0].image_path;

      const fullPath = path.join('uploads', imagePath);

      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Device Image</title>
        </head>
        <body>
          <h1>Device Image</h1>
          <img src="/${imagePath}" alt="Device Image" style="max-width: 500px;">
        </body>
        </html>
      `);
    } else {
      res.status(404).send('Image not found.');
    }
  });
});



app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) {
    res.status(400).send('Username, password, and email are required.');
    return;
  }

  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    connection.query('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', 
    [username, hashedPassword, email], 
    (error, results) => {
      if (error) {
        res.status(500).send('Error on the server.');
        return;
      }
      res.status(201).send(`User created with ID: ${results.insertId}`);
    });
  } catch (error) {
    res.status(500).send('Server error while hashing the password.');
  }
});

app.get('/users', (req, res) => {
  connection.query('SELECT * FROM users', (error, results) => {
    if (error) {
      res.status(500).send('Error on the server: ' + error.message);
      return;
    }
    res.json(results);
  });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password are required.');
  }

  connection.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (error, results) => {
      if (error) {
        return res.status(500).send('Error on the server.');
      }

      if (results.length > 0) {
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          res.status(200).send(`User ${user.username} logged in successfully.`);
        } else {
          res.status(401).send('Login failed.');
        }
      } else {
        res.status(404).send('User not found.');
      }
    }
  );
});



app.post('/devices/:id/checkout', (req, res) => {
  const { id } = req.params; 
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).send('User ID is required');
  }

  connection.query(
    'UPDATE devices SET user_id = ? WHERE id = ? AND user_id IS NULL',
    [userId, id],
    (error, results) => {
      if (error) {
        res.status(500).send('Error on the server.');
        return;
      }
      if (results.affectedRows > 0) {
        res.send(`Device with id = ${id} checked out successfully for user with id = ${userId}.`);

        connection.query(
          'UPDATE devices SET user_id = ? WHERE id = ?',
          [userId, id],
          (updateError) => {
            if (updateError) {
              console.error('Error updating user_id:', updateError);
            }
          }
        );
      } else {
        res.status(400).send('Device is not available or does not exist.');
      }
    }
  );
});

app.post('/devices/:id/checkin', (req, res) => {
  const { id } = req.params;
  connection.query(
    'SELECT user_id FROM devices WHERE id = ?',
    [id],
    (selectError, selectResults) => {
      if (selectError) {
        res.status(500).send('Error on the server.');
        return;
      }
      
      if (selectResults.length === 0 || selectResults[0].user_id === null) {
        res.status(400).send('Device is not checked out or does not exist.');
      } else {
        connection.query(
          'UPDATE devices SET user_id = NULL WHERE id = ?',
          [id],
          (updateError, updateResults) => {
            if (updateError) {
              res.status(500).send('Error on the server.');
              return;
            }
            if (updateResults.affectedRows > 0) {
              res.setHeader('Content-Type', 'application/json'); 
              res.status(200).json({ message: `Device with id = ${id} checked in successfully.` });
            } else {
              res.status(400).send('Device is not checked out or does not exist.');
            }
          }
        );
      }
    }
  );
});

app.post('/upload-user-image/:userId', upload.single('userImage'), (req, res) => {
  const { userId } = req.params;
  const filePath = req.file.path;

  connection.query('UPDATE users SET image_path = ? WHERE id = ?', [filePath, userId], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.affectedRows > 0) {
      res.send(`File uploaded as ${filePath}`);
    } else {
      res.status(404).send('User not found.');
    }
  });
});

app.get('/user-image/:userId', (req, res) => {
  const { userId } = req.params;

  connection.query('SELECT image_path FROM users WHERE id = ?', [userId], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    if (results.length > 0 && results[0].image_path) {
      const imagePath = results[0].image_path;

      res.sendFile(path.join(__dirname, imagePath));
    } else {
      res.status(404).send('Image not found.');
    }
  });
});

app.get('/user/:userId/devices', (req, res) => {
  const { userId } = req.params;

  connection.query('SELECT * FROM devices WHERE user_id = ?', [userId], (error, results) => {
    if (error) {
      res.status(500).send('Error on the server.');
      return;
    }
    res.json(results);
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
