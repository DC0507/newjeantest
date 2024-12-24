const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("globalLeaders-getAll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "globalLeaders",
  handler: async (request, context) => {
    try {
      await initializeCosmosDb();
      const container = getContainer();

      // Query to fetch all global leaders
      const globalLeadersQuery = {
            query: `
            SELECT c.userId, c.goalId, c.completedDays
            FROM c
            WHERE c.type = 'globalLeader'
        `,
      };

      const { resources: globalLeaders } = await container.items.query(globalLeadersQuery).fetchAll();
      if (!globalLeaders.length) {
        return {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([]),
        };
      }

      // Extract unique userIds and goalIds
      const userIds = [...new Set(globalLeaders.map((leader) => leader.userId))];
      const goalIds = [...new Set(globalLeaders.map((leader) => leader.goalId))];

      // Fetch user data
      const userQuery = {
        query: `
          SELECT c.id AS userId, c.username
          FROM c
          WHERE c.type = 'user' AND c.id IN (${userIds.map((_, i) => `@userId${i}`).join(", ")})
        `,
        parameters: userIds.map((id, i) => ({ name: `@userId${i}`, value: id })),
      };
      const { resources: users } = await container.items.query(userQuery).fetchAll();
      const userMap = users.reduce((map, user) => {
        map[user.userId] = user.username;
        return map;
      }, {});

      // Fetch goal data
      const goalQuery = {
        query: `
          SELECT c.id AS goalId, c.goalName, c.completionStreak
          FROM c
          WHERE c.type = 'goal' AND c.id IN (${goalIds.map((_, i) => `@goalId${i}`).join(", ")})
        `,
        parameters: goalIds.map((id, i) => ({ name: `@goalId${i}`, value: id })),
      };
      const { resources: goals } = await container.items.query(goalQuery).fetchAll();
      const goalMap = goals.reduce((map, goal) => {
        map[goal.goalId] = {
          goalName: goal.goalName,
          completionStreak: goal.completionStreak,
        };
        return map;
      }, {});

      // Enrich global leaders with username and goal details
      const enrichedLeaders = globalLeaders.map((leader) => ({
        ...leader,
        username: userMap[leader.userId] || "Unknown",
        goalName: goalMap[leader.goalId]?.goalName || "Unknown",
        completionStreak: goalMap[leader.goalId]?.completionStreak || 0,
      }));

      // Sort the enriched leaders by completionStreak
      enrichedLeaders.sort((a, b) => b.completedDays - a.completedDays);

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", // Disable caching
          "Pragma": "no-cache",
          "Expires": "0",
      },
        body: JSON.stringify(enrichedLeaders),
      };
    } catch (error) {
      context.log("Error fetching global leaders:", error.message, error.stack);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error", details: error.message }),
      };
    }
  },
});