const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.PASSWORD}@cluster0.zkkhb10.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Database and collection references
    const productsCollection = client
      .db("srs-publications")
      .collection("products");
    const cartCollection = client.db("srs-publications").collection("carts");
    const usersCollection = client.db("srs-publications").collection("users"); // Users collection

    // Endpoint to add a new user to the database
    app.post("/api/users", async (req, res) => {
      const { name, email } = req.body;

      if (!name || !email) {
        return res.status(400).send({ message: "Name and email are required" });
      }

      try {
        const user = {
          name,
          email,
          createdAt: new Date(), // Timestamp for user creation
        };

        const result = await usersCollection.insertOne(user);
        res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).send({ message: "Error adding user" });
      }
    });

    // Endpoint to add an item to the cart for a specific user
    app.post("/api/cart", async (req, res) => {
      const { userId, item } = req.body;

      if (!userId || !item) {
        return res
          .status(400)
          .send({ message: "User ID and item are required" });
      }

      try {
        // Check if the item is already in the user's cart
        const existingCartItem = await cartCollection.findOne({
          userId,
          "item._id": item._id,
        });

        if (existingCartItem) {
          // If the item exists, increment the quantity
          await cartCollection.updateOne(
            { _id: existingCartItem._id },
            { $inc: { "item.quantity": 1 } }
          );
          res.status(200).send({ message: "Item quantity updated in cart" });
        } else {
          // If the item is not in the cart, insert it with quantity 1
          const cartItem = {
            userId,
            item: { ...item, quantity: 1 }, // Set initial quantity to 1
            addedAt: new Date(),
          };

          const result = await cartCollection.insertOne(cartItem);
          res.status(201).send({
            message: "Item added to cart",
            cartItemId: result.insertedId,
          });
        }
      } catch (error) {
        console.error("Error adding item to cart:", error);
        res.status(500).send({ message: "Error adding item to cart" });
      }
    });

    // Endpoint to fetch all cart items for a specific user
    app.get("/cart/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        // Find cart items for the given userId
        const userCartItems = await cartCollection.find({ userId }).toArray();
        res.send(userCartItems);
      } catch (error) {
        console.error("Error fetching cart items:", error);
        res.status(500).send({ message: "Error fetching cart items" });
      }
    });

    // Endpoint to get all products
    app.get("/products", async (req, res) => {
      try {
        const result = await productsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ message: "Error fetching products" });
      }
    });

    // Ping to ensure the connection works
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your MongoDB deployment successfully!");
  } finally {
    // Uncomment in production to close connection after running
    // await client.close();
  }
}

// Run the MongoDB client
run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("srs-publication is publishing");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
