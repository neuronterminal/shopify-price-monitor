// app/routes/api.update-prices.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  console.log("API route called:", request.url);
  
  try {
    // Explicitly check if authenticate is defined
    if (!authenticate || typeof authenticate.admin !== 'function') {
      console.error("Shopify authentication not properly initialized");
      return json({ error: "Internal server configuration error" }, { status: 500 });
    }
    
    // Authentication with error handling
    let admin;
    try {
      const authResult = await authenticate.admin(request);
      if (!authResult || !authResult.admin) {
        console.error("Authentication failed or returned unexpected result:", authResult);
        return json({ error: "Authentication failed" }, { status: 401 });
      }
      admin = authResult.admin;
    } catch (authError) {
      console.error("Authentication error:", authError);
      return json({ error: "Authentication error: " + authError.message }, { status: 401 });
    }
    
    // Check request method
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    
    // Parse JSON body with error handling
    let goldPrice;
    try {
      const body = await request.json();
      goldPrice = body.goldPrice;
      console.log("Received gold price:", goldPrice);
    } catch (error) {
      console.error("Error parsing request body:", error);
      return json({ error: "Invalid request body: " + error.message }, { status: 400 });
    }

    if (!goldPrice || isNaN(goldPrice)) {
      console.log("Invalid gold price received:", goldPrice);
      return json({ error: "Invalid gold price" }, { status: 400 });
    }

    console.log("Fetching products with goldPrice:", goldPrice);
    const productsQuery = `
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    metafields(first: 10) {
                      edges {
                        node {
                          namespace
                          key
                          value
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    // GraphQL call with error handling
    let productsData;
    try {
      const productsResponse = await admin.graphql(productsQuery);
      productsData = await productsResponse.json();
      
      if (productsData.errors) {
        console.error("GraphQL errors:", productsData.errors);
        return json({ error: "GraphQL error: " + productsData.errors[0]?.message }, { status: 500 });
      }
    } catch (graphqlError) {
      console.error("GraphQL request failed:", graphqlError);
      return json({ error: "Failed to fetch products: " + graphqlError.message }, { status: 500 });
    }
    
    if (!productsData.data || !productsData.data.products) {
      console.error("Unexpected GraphQL response:", productsData);
      return json({ error: "Failed to fetch products: Invalid response" }, { status: 500 });
    }
    
    const products = productsData.data.products.edges;
    console.log("Products fetched:", products.length);
    
    if (products.length === 0) {
      return json({ message: "No products found to update" });
    }

    // Process each product
    const updates = products.map(async (product) => {
      try {
        if (!product.node.variants || !product.node.variants.edges || !product.node.variants.edges[0]) {
          console.log(`Skipping product ${product.node.title} due to missing variant`);
          return null;
        }
        
        const variant = product.node.variants.edges[0].node;
        
        if (!variant.metafields || !variant.metafields.edges) {
          console.log(`Skipping product ${product.node.title} due to missing metafields`);
          return null;
        }
        
        const metafield = variant.metafields.edges.find(m => 
          m.node.namespace === "gold" && m.node.key === "multiplier"
        )?.node;
        
        if (!metafield) {
          console.log(`Skipping product ${product.node.title} - no gold multiplier metafield`);
          return null;
        }
        
        const multiplier = parseFloat(metafield.value) || 0;
        
        if (multiplier <= 0) {
          console.log(`Skipping product ${product.node.title} - multiplier is ${multiplier}`);
          return null;
        }
        
        const newPrice = (goldPrice * multiplier).toFixed(2);
        console.log(`Updating ${product.node.title}: multiplier=${multiplier}, newPrice=${newPrice}`);

        const mutation = `
          mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              productVariant {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        const response = await admin.graphql(mutation, {
          variables: {
            input: {
              id: variant.id,
              price: newPrice,
            },
          },
        });
        
        const result = await response.json();
        
        if (result.data?.productVariantUpdate?.userErrors?.length > 0) {
          const errors = result.data.productVariantUpdate.userErrors;
          console.error(`Error updating ${product.node.title}:`, errors);
          return { productTitle: product.node.title, success: false, errors };
        } else {
          console.log(`Updated ${product.node.title} to $${newPrice}`);
          return { productTitle: product.node.title, success: true, newPrice };
        }
      } catch (productError) {
        console.error(`Error processing product ${product.node.title}:`, productError);
        return { productTitle: product.node.title, success: false, error: productError.message };
      }
    });

    try {
      const results = await Promise.all(updates);
      const validResults = results.filter(Boolean);
      const successCount = validResults.filter(r => r.success).length;
      const failureCount = validResults.filter(r => !r.success).length;
      
      console.log(`Update complete: ${successCount} succeeded, ${failureCount} failed`);
      
      return json({ 
        message: `Updated ${successCount} products successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        successCount,
        failureCount
      });
    } catch (updateError) {
      console.error("Error during batch update:", updateError);
      return json({ error: "Some updates failed: " + updateError.message }, { status: 500 });
    }
  } catch (error) {
    console.error("Unhandled error in API route:", error);
    return json({ error: "Server error: " + (error.message || "Unknown error") }, { status: 500 });
  }
}

// Also export a loader to handle GET requests more gracefully
export async function loader() {
  return json({ error: "This endpoint only accepts POST requests" }, { status: 405 });
}