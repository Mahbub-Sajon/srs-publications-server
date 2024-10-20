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
    const paymentsCollection = client
      .db("srs-publications")
      .collection("payments");

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

    // Endpoint to get all users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        console.log(users); // Check if users are being fetched correctly
        res.status(200).send(users);
      } catch (error) {
        res.status(500).send({ message: "Error fetching users" });
      }
    });
    //
    // Endpoint to check if a user is an admin by email
    app.get("/api/users/admin/:email", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await usersCollection.findOne({ email });
        if (user && user.role === "admin") {
          return res.status(200).send({ isAdmin: true });
        }
        res.status(200).send({ isAdmin: false });
      } catch (error) {
        console.error("Error checking admin status:", error);
        res.status(500).send({ message: "Error checking admin status" });
      }
    });
    // Endpoint to get user details by email
    app.get("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (user) {
          res.status(200).send(user);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error fetching user" });
      }
    });
    // Endpoint to update user details
    app.put("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const { name } = req.body;

      try {
        const updateDoc = {
          $set: {
            name,
          },
        };
        const result = await usersCollection.updateOne({ email }, updateDoc);
        if (result.modifiedCount > 0) {
          res.status(200).send({ message: "User updated successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error updating user" });
      }
    });

    // Endpoint to delete a user
    app.delete("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: "User deleted successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error deleting user" });
      }
    });
    //make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
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
    // Endpoint to clear a user's cart
    app.delete("/cart/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const result = await cartCollection.deleteMany({ userId });

        if (result.deletedCount > 0) {
          res.status(200).send({ message: "Cart cleared successfully" });
        } else {
          res.status(404).send({ message: "No items found in cart" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error clearing cart" });
      }
    });

    // Endpoint to place an order
    app.post("/api/orders", async (req, res) => {
      const { userId, items, address, phone, totalPrice } = req.body;

      if (!userId || !items || !address || !phone || !totalPrice) {
        return res.status(400).send({ message: "All fields are required" });
      }

      try {
        const discountedPrice = totalPrice * 0.85;

        const order = {
          userId,
          items,
          address,
          phone,
          totalPrice: discountedPrice,
          createdAt: new Date(),
        };

        const result = await ordersCollection.insertOne(order);
        res.status(201).send({
          message: "Order placed successfully with discount",
          orderId: result.insertedId,
          discountedPrice, // Return the discounted price
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
    //add products
    // Endpoint to add a new product
    app.post("/products", async (req, res) => {
      const { image, title, category, quantity, price, description } = req.body;

      if (
        !image ||
        !title ||
        !category ||
        !quantity ||
        !price ||
        !description
      ) {
        return res.status(400).send({ message: "All fields are required" });
      }

      try {
        const product = {
          image,
          title,
          category,
          quantity: parseInt(quantity),
          price: parseFloat(price),
          description,
          addedAt: new Date(),
        };

        const result = await productsCollection.insertOne(product);
        res.status(201).send({
          message: "Product added successfully",
          productId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: "Error adding product" });
      }
    });

    //transaction id
    const generateTransactionId = new ObjectId().toString();

    // SSLCommerz payment integration
    app.post("/create-payment", async (req, res) => {
      const { orderData } = req.body;

      // Destructure properties from orderData
      const {
        userId,
        userName,
        items,
        address,
        phone,
        totalPrice,
        createdAt,
        email,
        productId,
      } = orderData;

      try {
        // Dynamically generate transaction ID

        const initiatePayment = {
          store_id: process.env.STORE_ID,
          store_passwd: process.env.STORE_PASSWORD,
          total_amount: totalPrice,
          currency: "BDT",
          tran_id: generateTransactionId, // Generate a unique transaction ID
          success_url: "https://srs-publications-server.vercel.app/success",
          fail_url: "https://srs-publications-server.vercel.app/fail",
          cancel_url: "https://srs-publications-server.vercel.app/cancel",
          product_name: items.map((item) => item.title).join(", ") || "Product",
          product_id: productId,
          product_category: "General",
          product_profile: "general",
          cus_name: userName,
          cus_email: email,
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

        const saveData = {
          cus_name: userName,
          tran_id: generateTransactionId,
          total_amount: totalPrice,
          cus_id: userId,
          cus_email: email,
          cus_add: address,
          cus_phone: phone,
          product_id: productId,
          product_name: items.map((item) => item.title).join(", "),
          quantity: items.map((item) => item.quantity).join(", "),
          time: createdAt,
          status: "Pending",
        };
        try {
          const result = await paymentsCollection.insertOne(saveData);
          console.log("Payment data saved successfully:", result);
        } catch (error) {
          console.error("Error inserting payment data into MongoDB:", error);
        }

        // }
        // Send the payment URL
        res.send({
          GatewayPageUrl: response.data.GatewayPageURL,
        });
      } catch (error) {
        console.error("Error initiating payment:", error);
        res.status(500).send({ message: "Error initiating payment" });
      }
    });
    // Endpoint to get payments by user email
    app.get("/api/payments", async (req, res) => {
      const { email } = req.query; // Get email from query parameters

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const payments = await paymentsCollection
          .find({ cus_email: email })
          .toArray();
        res.status(200).send(payments);
      } catch (error) {
        res.status(500).send({ message: "Error fetching payments" });
      }
    });

    app.post("/success", async (req, res) => {
      const successData = req.body;
      console.log("Payment Success:", successData);

      if (successData.status != "VALID") {
        throw new Error("Unauthorized Payment");
      }

      //update the database after complete payment
      const query = {
        tran_id: successData.tran_id,
      };
      const update = {
        $set: {
          status: "Success",
        },
      };
      const updateData = await paymentsCollection.updateOne(query, update);
      res.redirect("https://srs-publications-b3f6c.web.app/success");
    });
    app.post("/fail", async (req, res) => {
      res.redirect("https://srs-publications-b3f6c.web.app/fail");
    });
    app.post("/cancel", async (req, res) => {
      res.redirect("https://srs-publications-b3f6c.web.app/cancel");
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
