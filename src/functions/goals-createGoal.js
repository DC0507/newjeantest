const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { v4: uuidv4 } = require("uuid");

app.http("goals-createGoal", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "goals",
  handler: async (request, context) => {
    await initializeCosmosDb();

    try {
      const goal = await request.json();
      const userId = goal.userId || "authenticatedUserId"; // Replace with actual user ID logic if required
      
      // Ensure the "type" field matches the new partition key
      const newGoal = {
        ...goal,
        id: uuidv4(),
        type: "goal", // This must match the partition key value
        userId,
        isDeleted: false,
      };

      const container = getContainer();
      
      // The partition key is implicitly derived from the "type" field
      const { resource: createdGoal } = await container.items.create(newGoal);

      return { status: 201, body: JSON.stringify(createdGoal) };
    } catch (error) {
      context.log("Error creating goal:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
