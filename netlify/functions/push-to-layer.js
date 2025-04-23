const fetch = require("node-fetch");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const LAYER_API_KEY = process.env.LAYER_API_KEY;

const TABLE_NAME = "Templates";

exports.handler = async function () {
  try {
    // 1. Fetch Airtable records with status Push
    const airtableURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=Status='Push'`;

    const recordsRes = await fetch(airtableURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const { records } = await recordsRes.json();
    if (!records.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No records with status Push." }),
      };
    }

    for (const record of records) {
      const projectURL = record.fields["Layer Project URL"];
      const templateName = record.fields["Template Name"];
      const schemaText = record.fields["JSON"];

      if (!projectURL || !schemaText) {
        console.warn(`⚠️ Skipping '${templateName}': missing Layer URL or JSON`);
        continue;
      }

      const projectId = projectURL.split("/").pop();
      const schema = JSON.parse(schemaText);

      // 2. Get categories from Layer project
      const layerRes = await fetch(`https://api.layer.team/v1/projects/${projectId}/categories`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${LAYER_API_KEY}`,
        },
      });

      const existingCategories = await layerRes.json();
      if (!Array.isArray(existingCategories)) {
        throw new Error("Layer API didn't return a category list.");
      }

      // 3. Validate each JSON category
      for (const jsonCategory of schema) {
        const match = existingCategories.find(
          (cat) =>
            cat.name.toLowerCase().trim() === jsonCategory.name.toLowerCase().trim()
        );

        if (!match) {
          console.error(`❌ Category not found in Layer: "${jsonCategory.name}"`);
        } else if (match.name !== jsonCategory.name) {
          console.warn(
            `⚠️ Category mismatch: expected "${jsonCategory.name}", found "${match.name}"`
          );
        } else {
          console.log(`✅ Category OK: "${jsonCategory.name}"`);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Validation completed." }),
    };
  } catch (err) {
    console.error("❌ Error in category validation:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
