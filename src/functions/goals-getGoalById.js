const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("goals-getGoalById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "goals/goalId/{id}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Extract goalId from context.bindingData or fallback to extracting it from the URL
    let goalId = context.bindingData?.id;
    if (!goalId) {
      const urlSegments = request.url.split('/');
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
      const container = getContainer();
      const querySpec = {
        query: `
          SELECT *
          FROM c
          WHERE c.type = 'goal'
            AND c.id = @goalId
            AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
        `,
        parameters: [{ name: "@goalId", value: goalId }],
      };

      const { resources: goals } = await container.items.query(querySpec).fetchAll();

      if (goals.length === 0) {
        return { status: 404, body: JSON.stringify({ error: "Goal not found." }) };
      }

      return { status: 200, body: JSON.stringify(goals[0]) };
    } catch (error) {
      context.log.error("Error fetching goal:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
