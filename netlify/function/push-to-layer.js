const fetch = require("node-fetch");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const LAYER_API_KEY = process.env.LAYER_API_KEY;

const TABLE_NAME = "Templates";

exports.handler = async () => {
  try {
    const airtableURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=Status='Push'`;

    const recordsResponse = await fetch(airtableURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const { records } = await recordsResponse.json();

    for (const record of records) {
      const json = record.fields.JSON;
      const url = record.fields["Layer Project URL"];

      if (!json || !url) continue;

      const projectId = url.split("/").pop();
      const schema = JSON.parse(json);

      for (const category of schema) {
        // Create category
        const catRes = await fetch(`https://api.layer.team/v1/projects/${projectId}/categories`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LAYER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: category.name }),
        });

        const catData = await catRes.json();
        const categoryId = catData.id;

        // Add fields to category
        for (const field of category.fields) {
          await fetch(`https://api.layer.team/v1/categories/${categoryId}/fields`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LAYER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: field.name,
              type: field.type,
              ...(field.options ? { options: field.options } : {})
            }),
          });
        }
      }

      // Update Airtable record
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [
            {
              id: record.id,
              fields: {
                Status: "Published",
              },
            },
          ],
        }),
      });

      console.log(`✅ Project ${projectId} pushed and marked as Published`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Push complete." }),
    };
  } catch (err) {
    console.error("❌ Error pushing to Layer:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
