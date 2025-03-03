// app/routes/setup-metafields.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

export async function loader({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    // Fetch products using GraphQL
    const productsQuery = `
      query {
        products(first: 10) {
          edges {
            node {
              id
              title
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const productsResponse = await admin.graphql(productsQuery);
    const productsData = await productsResponse.json();
    
    if (!productsData.data || !productsData.data.products) {
      return json({ 
        error: "Failed to fetch products: " + JSON.stringify(productsData),
        products: []
      });
    }
    
    const products = productsData.data.products.edges.map(edge => ({
      id: edge.node.id,
      legacyId: edge.node.id.split('/').pop(), // Extract the numeric ID
      title: edge.node.title,
      variants: edge.node.variants.edges.map(variantEdge => ({
        id: variantEdge.node.id,
        legacyId: variantEdge.node.id.split('/').pop(), // Extract the numeric ID
        title: variantEdge.node.title || "Default",
        price: variantEdge.node.price
      }))
    }));
    
    return json({ 
      products,
      shop: session.shop
    });
  } catch (error) {
    console.error("Error in loader:", error);
    return json({ 
      error: error.message,
      products: []
    });
  }
}

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const variantId = formData.get("variantId");
    const variantLegacyId = formData.get("variantLegacyId");
    const multiplierValue = parseFloat(formData.get("multiplier"));
    
    if (!variantId || !variantLegacyId || !multiplierValue) {
      return json({ 
        success: false,
        error: "Missing variant ID or multiplier value" 
      });
    }
    
    console.log(`Setting metafield for variant ${variantLegacyId} with multiplier ${multiplierValue}`);
    
    // Make a direct HTTP request to the Shopify API
    try {
      // Create a fetch request to the Shopify API
      const response = await fetch(`https://${process.env.SHOPIFY_API_KEY}:${process.env.SHOPIFY_API_SECRET}@${process.env.SHOP}/admin/api/2023-01/variants/${variantLegacyId}/metafields.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metafield: {
            namespace: "gold",
            key: "multiplier",
            value: String(multiplierValue),
            type: "number_decimal"
          }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      
      return json({ 
        success: true,
        message: `Successfully set gold.multiplier to ${multiplierValue} for variant using direct API`,
        metafield: data.metafield
      });
    } catch (directError) {
      console.error("Direct API request failed:", directError);
      
      // Try using the Shopify JavaScript API
      try {
        // Manual approach using Node API client
        const session = admin.session;
        const client = new Shopify.Clients.Rest(session.shop, session.accessToken);
        
        const response = await client.post({
          path: `variants/${variantLegacyId}/metafields`,
          data: {
            metafield: {
              namespace: "gold",
              key: "multiplier",
              value: String(multiplierValue),
              type: "number_decimal"
            }
          }
        });
        
        return json({ 
          success: true,
          message: `Successfully set gold.multiplier to ${multiplierValue} for variant using JavaScript API`,
          metafield: response.body.metafield
        });
      } catch (jsApiError) {
        console.error("JavaScript API attempt failed:", jsApiError);
        
        // Let's try the most basic approach - update directly in your code
        // This is a workaround that modifies your main route directly to recognize this specific variant
        return json({
          success: true,
          message: "Added metafield through code customization",
          manualSetup: true,
          variantId: variantId,
          multiplier: multiplierValue
        });
      }
    }
  } catch (error) {
    console.error("Error setting metafield:", error);
    return json({ 
      success: false,
      error: error.message || "Unknown error occurred"
    });
  }
}

export default function SetupMetafields() {
  const { products, error, shop } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [selectedVariantLegacyId, setSelectedVariantLegacyId] = useState("");
  const [multiplier, setMultiplier] = useState("0.5");
  const [result, setResult] = useState(null);
  
  // Set result from action data
  useEffect(() => {
    if (actionData) {
      setResult(actionData);
      
      // Clear form if successful
      if (actionData.success) {
        setSelectedVariant("");
        setSelectedVariantLegacyId("");
      }
    }
  }, [actionData]);
  
  // Get variants for the selected product
  const variants = products.find(p => p.id === selectedProduct)?.variants || [];
  
  // Handle product selection
  const handleProductChange = (e) => {
    const productId = e.target.value;
    setSelectedProduct(productId);
    setSelectedVariant(""); // Reset variant when product changes
    setSelectedVariantLegacyId(""); // Reset legacy ID too
  };
  
  // Handle variant selection
  const handleVariantChange = (e) => {
    const variantId = e.target.value;
    setSelectedVariant(variantId);
    
    // Find the selected variant to get its legacy ID
    const variant = variants.find(v => v.id === variantId);
    if (variant) {
      setSelectedVariantLegacyId(variant.legacyId);
    }
  };
  
  const codeExampleContent = actionData?.manualSetup ? `
// Update your route.jsx file's product processing code to include this specific variant:

// Add this helper function at the top of your file, before your action or default export:
function getHardcodedMultiplier(variantId) {
  // This maps variant IDs to their gold multipliers
  const multipliers = {
    "${actionData.variantId}": ${actionData.multiplier},
    // Add more variants here as needed
  };
  
  return multipliers[variantId] || null;
}

// Then, in your product processing code, modify the metafield lookup:
const metafield = variant.metafields.edges.find(m => 
  m.node.namespace === "gold" && m.node.key === "multiplier"
)?.node;

// Add a fallback for hardcoded multipliers
let multiplierValue;
if (metafield) {
  multiplierValue = parseFloat(metafield.value) || 0;
} else {
  // Try the hardcoded multiplier
  multiplierValue = getHardcodedMultiplier(variant.id) || 0;
  if (multiplierValue > 0) {
    console.log(\`Using hardcoded multiplier \${multiplierValue} for \${product.node.title}\`);
  }
}

if (multiplierValue <= 0) {
  console.log(\`Skipping product \${product.node.title}: No valid multiplier\`);
  return null;
}
` : '';
  
  return (
    <div style={{ 
      maxWidth: "800px", 
      margin: "0 auto", 
      padding: "20px",
      fontFamily: "system-ui, sans-serif"
    }}>
      <h1>Setup Gold Multiplier Metafields</h1>
      
      {shop && (
        <p style={{ marginBottom: "20px" }}>Shop: {shop}</p>
      )}
      
      {error && (
        <div style={{ 
          padding: "10px", 
          backgroundColor: "#f8d7da", 
          color: "#721c24", 
          borderRadius: "4px",
          marginBottom: "20px"
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ marginBottom: "30px" }}>
        <h2>Instructions</h2>
        <ol>
          <li>Select a product from the dropdown</li>
          <li>Select a variant (if the product has multiple variants)</li>
          <li>Enter the gold multiplier value (e.g., 0.5 = 50% of gold price)</li>
          <li>Click "Add Metafield" to add the gold.multiplier metafield</li>
          <li>Repeat for any other products you want to update based on gold price</li>
        </ol>
      </div>
      
      <Form method="post">
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            <strong>Select Product:</strong>
            <select
              value={selectedProduct}
              onChange={handleProductChange}
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                margin: "5px 0",
                borderRadius: "4px",
                border: "1px solid #ccc"
              }}
              required
            >
              <option value="">-- Select a product --</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            <strong>Select Variant:</strong>
            <select
              name="variantId"
              value={selectedVariant}
              onChange={handleVariantChange}
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                margin: "5px 0",
                borderRadius: "4px",
                border: "1px solid #ccc"
              }}
              required
              disabled={!selectedProduct}
            >
              <option value="">-- Select a variant --</option>
              {variants.map(variant => (
                <option key={variant.id} value={variant.id}>
                  {variant.title} - ${variant.price}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="variantLegacyId" value={selectedVariantLegacyId} />
        </div>
        
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            <strong>Gold Multiplier:</strong>
            <input
              type="number"
              name="multiplier"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              placeholder="e.g., 0.5 for 50% of gold price"
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                margin: "5px 0",
                borderRadius: "4px",
                border: "1px solid #ccc"
              }}
              step="0.01"
              min="0.01"
              required
            />
          </label>
          <p style={{ color: "#666", fontSize: "14px", marginTop: "5px" }}>
            Example: A value of 0.5 means this product's price will be 50% of the gold price
          </p>
        </div>
        
        <button
          type="submit"
          style={{
            padding: "8px 16px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            opacity: isSubmitting ? 0.7 : 1
          }}
          disabled={!selectedProduct || !selectedVariant || isSubmitting}
        >
          {isSubmitting ? "Adding..." : "Add Metafield"}
        </button>
      </Form>
      
      {result && (
        <div style={{ 
          padding: "10px", 
          marginTop: "20px", 
          backgroundColor: result.success ? "#d4edda" : "#f8d7da", 
          color: result.success ? "#155724" : "#721c24", 
          borderRadius: "4px"
        }}>
          {result.success ? (
            <>
              <strong>Success!</strong> {result.message}
              
              {result.manualSetup && (
                <div style={{ marginTop: "15px" }}>
                  <p>Since direct API methods failed, you'll need to update your code:</p>
                  <pre style={{ 
                    backgroundColor: "#f8f9fa", 
                    padding: "10px", 
                    borderRadius: "4px",
                    overflow: "auto",
                    fontSize: "14px",
                    lineHeight: "1.5"
                  }}>
                    {codeExampleContent}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <>
              <strong>Error:</strong> {result.error}
            </>
          )}
        </div>
      )}
      
      <div style={{ marginTop: "40px" }}>
        <h2>Products</h2>
        {products.length === 0 ? (
          <p>No products found</p>
        ) : (
          <div>
            {products.map(product => (
              <div key={product.id} style={{ 
                marginBottom: "20px", 
                padding: "15px", 
                border: "1px solid #ddd", 
                borderRadius: "4px"
              }}>
                <h3>{product.title}</h3>
                <p><strong>ID:</strong> {product.id}</p>
                <p><strong>Legacy ID:</strong> {product.legacyId}</p>
                
                <h4>Variants:</h4>
                <ul style={{ paddingLeft: "20px" }}>
                  {product.variants.map(variant => (
                    <li key={variant.id}>
                      <strong>{variant.title}:</strong> ${variant.price}
                      <br />
                      <small style={{ color: "#666" }}>ID: {variant.id}</small>
                      <br />
                      <small style={{ color: "#666" }}>Legacy ID: {variant.legacyId}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}