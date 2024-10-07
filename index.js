const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.PASSWORD}@cluster0.cwu3x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    const productsCollection = client
      .db("srs-publications")
      .collection("products");
    const cartCollection = client.db("srs-publications").collection("carts");
    const usersCollection = client.db("srs-publications").collection("users");
    const ordersCollection = client.db("srs-publications").collection("orders");

    // Endpoint to add a user
    app.post("/api/users", async (req, res) => {
      const { name, email } = req.body;

      if (!name || !email) {
        return res.status(400).send({ message: "Name and email are required" });
      }

      try {
        const user = {
          name,
          email,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(user);
        res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: "Error adding user" });
      }
    });

    // Endpoint to add an item to the cart
    app.post("/api/cart", async (req, res) => {
      const { userId, item } = req.body;

      if (!userId || !item) {
        return res
          .status(400)
          .send({ message: "User ID and item are required" });
      }

      try {
        const existingCartItem = await cartCollection.findOne({
          userId,
          "item._id": item._id,
        });

        if (existingCartItem) {
          await cartCollection.updateOne(
            { _id: existingCartItem._id },
            { $inc: { "item.quantity": 1 } }
          );
          res.status(200).send({ message: "Item quantity updated in cart" });
        } else {
          const cartItem = {
            userId,
            item: { ...item, quantity: 1 },
            addedAt: new Date(),
          };

          const result = await cartCollection.insertOne(cartItem);
          res.status(201).send({
            message: "Item added to cart",
            cartItemId: result.insertedId,
          });
        }
      } catch (error) {
        res.status(500).send({ message: "Error adding item to cart" });
      }
    });

    // Endpoint to fetch cart items
    app.get("/cart/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const userCartItems = await cartCollection.find({ userId }).toArray();
        res.send(userCartItems);
      } catch (error) {
        res.status(500).send({ message: "Error fetching cart items" });
      }
    });

    // Endpoint to place an order
    app.post("/api/orders", async (req, res) => {
      const { userId, items, address, phone, totalPrice } = req.body;

      if (!userId || !items || !address || !phone || !totalPrice) {
        return res.status(400).send({ message: "All fields are required" });
      }

      try {
        const order = {
          userId,
          items,
          address,
          phone,
          totalPrice,
          createdAt: new Date(),
        };

        const result = await ordersCollection.insertOne(order);
        res.status(201).send({
          message: "Order placed successfully",
          orderId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: "Error placing order" });
      }
    });

    // Endpoint to get all products
    app.get("/products", async (req, res) => {
      try {
        const result = await productsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching products" });
      }
    });
    //transaction id
    const generateTransactionId = () => {
      const timestamp = Date.now(); // Get the current timestamp
      const randomNum = Math.floor(Math.random() * 100000); // Generate a random number between 0 and 99999
      return `txn_${timestamp}_${randomNum}`; // Combine them into a string
    };

    // SSLCommerz payment integration
    app.post("/create-payment", async (req, res) => {
      const { orderData } = req.body;

      // Destructure properties from orderData
      const { userId, userName, items, address, phone, totalPrice, createdAt } =
        orderData;

      try {
        const transactionId = generateTransactionId(); // Dynamically generate transaction ID

        const initiatePayment = {
          store_id: process.env.STORE_ID,
          store_passwd: process.env.STORE_PASSWORD,
          total_amount: totalPrice,
          currency: "BDT",
          tran_id: transactionId, // Generate a unique transaction ID
          success_url: "http://localhost:5000/success-payment",
          fail_url: "http://localhost:5000/fail-payment",
          cancel_url: "http://localhost:5000/cancel-payment",
          product_name: items.map((item) => item.title).join(", ") || "Product",
          product_category: "General",
          product_profile: "general",
          cus_name: userName,
          cus_email: phone,
          cus_add1: address,
          cus_add2: "Dhaka",
          cus_city: "Dhaka",
          cus_state: "Dhaka",
          cus_postcode: "1000",
          cus_country: "Bangladesh",
          cus_phone: "01711111111",
          cus_fax: "01711111111",
          shipping_method: "NO",
          multi_card_name: "mastercard,visacard,amexcard",
          value_a: "ref001_A",
          value_b: "ref002_B",
          value_c: "ref003_C",
          value_d: "ref004_D",
        };

        const response = await axios({
          method: "POST",
          url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          data: initiatePayment,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        console.log("SSLCommerz response:", response.data);

        // Send the payment URL
        res.send({
          GatewayPageUrl: response.data.GatewayPageURL,
          // Match this to the frontend expectation
        });
      } catch (error) {
        console.error("Error initiating payment:", error);
        res.status(500).send({ message: "Error initiating payment" });
      }
    });

    app.post("/success-payment", async (req, res) => {
      console.log("Payment Success:", req.body);
      res.send({ message: "Payment Successful" });
    });

    // Ping to ensure connection works
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } finally {
    // Uncomment in production
    // await client.close();
  }
}

run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("srs-publication is publishing");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
