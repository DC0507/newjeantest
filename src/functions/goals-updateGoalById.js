const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const jwt = require("jsonwebtoken");

const SECRET_KEY = "jwtPrivateKey"; // Replace with your actual secret key

app.http("goals-updateGoalById", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "goals/{id}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Extract goalId from context.bindingData or fallback to extracting it from the URL
    let goalId = context.bindingData?.id;
    if (!goalId) {
      const urlSegments = request.url.split("/");
      goalId = urlSegments[urlSegments.length - 1];
    }

    // Validate goalId
    if (!goalId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Goal ID is required in the route." }),
      };
    }

    try {
      // Extract token using headers.get()
      const token = request.headers.get("x-auth-token");

      if (!token) {
        return {
          status: 401,
          body: JSON.stringify({ error: "Authentication token is required." }),
        };
      }

      let userId;
      try {
        // Decode the token to extract userId
        const decoded = jwt.verify(token, SECRET_KEY);
        userId = decoded.userId; // Ensure `userId` exists in the token payload
      } catch (err) {
        console.error("Invalid token:", err.message);
        return {
          status: 401,
          body: JSON.stringify({ error: "Invalid authentication token." }),
        };
      }

      const container = getContainer();

      // Use "goal" as the type partition key value
      const partitionKey = "goal";

      // Fetch the existing goal
      const { resource: existingGoal } = await container.item(goalId, partitionKey).read();

      if (!existingGoal) {
        console.error("Goal not found in Cosmos DB for goalId:", goalId);
        return { status: 404, body: JSON.stringify({ error: "Goal not found." }) };
      }

      const updatedFields = await request.json();
      const updatedGoal = { ...existingGoal, ...updatedFields };

      const { resource: replacedGoal } = await container.item(goalId, partitionKey).replace(updatedGoal);

      return { status: 200, body: JSON.stringify(replacedGoal) };
    } catch (error) {
      context.log.error("Error updating goal:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
