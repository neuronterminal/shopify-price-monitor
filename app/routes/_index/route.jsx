// app/routes/_index/route.jsx
import { Form, useLoaderData } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { useState } from "react";
import { authenticate } from "../../shopify.server";

// DIRECT PRODUCT MAPPING - NO API DEPENDENCIES
// Add all your products here with their exact names and multipliers
const PRODUCTS = [
  {
    title: "iced out chain",
    variants: [
      { title: "Default", multiplier: 0.5 },
      { title: "0", multiplier: 0.5 },
      { title: "1", multiplier: 0.5 }
    ]
  },
  {
    title: "gold cuban chain 20inch",
    variants: [
      { title: "Default", multiplier: 0.5 },
      { title: "0", multiplier: 0.5 },
      { title: "1", multiplier: 0.5 }
    ]
  },
  {
    title: "rolex watch",
    variants: [
      { title: "Default", multiplier: 0.5 },
      { title: "0", multiplier: 0.5 },
      { title: "1", multiplier: 0.5 }
    ]
  }
  // Add more products as needed
];

export async function loader({ request }) {
  try {
    // Basic authentication check
    await authenticate.admin(request);
    
    // Fetch all products to display the current prices
    const { admin } = await authenticate.admin(request);
    
    try {
      // Fetch products using GraphQL
      const productsQuery = `
        query {
          products(first: 50) {
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
        throw new Error("Failed to fetch products");
      }
      
      // Transform the response into a simple array
      const products = productsData.data.products.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        variants: edge.node.variants.edges.map(variantEdge => ({
          id: variantEdge.node.id,
          title: variantEdge.node.title || "Default",
          price: variantEdge.node.price
        }))
      }));
      
      return json({ 
        authenticated: true,
        products
      });
    } catch (fetchError) {
      console.error("Error fetching products:", fetchError);
      return json({ 
        authenticated: true, 
        products: [],
        fetchError: fetchError.message
      });
    }
  } catch (error) {
    console.error("Authentication error in loader:", error);
    return json({ authenticated: false, error: error.message });
  }
}

export async function action({ request }) {
  try {
    // Authenticate with Shopify
    const { admin } = await authenticate.admin(request);
    
    // Parse form data
    const formData = await request.formData();
    const goldPrice = parseFloat(formData.get("goldPrice"));
    
    if (!goldPrice || isNaN(goldPrice) || goldPrice <= 0) {
      return json({ 
        error: "Please enter a valid gold price (must be greater than 0)",
        success: false
      });
    }
    
    console.log("Processing gold price:", goldPrice);
    
    // Fetch all products
    const productsQuery = `
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              variants(first: 10) {
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
    
    if (productsData.errors) {
      console.error("GraphQL errors:", productsData.errors);
      return json({ 
        error: "Failed to fetch products: " + productsData.errors[0]?.message,
        success: false
      });
    }
    
    if (!productsData.data || !productsData.data.products) {
      return json({ 
        error: "Failed to fetch products: Invalid response",
        success: false
      });
    }
    
    const fetchedProducts = productsData.data.products.edges;
    console.log("Products fetched:", fetchedProducts.length);
    
    if (fetchedProducts.length === 0) {
      return json({ 
        message: "No products found to update",
        success: true
      });
    }
    
    // Find products that match our hardcoded list and update them
    const productsToUpdate = [];
    const updateDetails = [];
    
    fetchedProducts.forEach(fetchedProduct => {
      // Find if this product is in our hardcoded list
      const matchingProduct = PRODUCTS.find(p => 
        p.title.toLowerCase() === fetchedProduct.node.title.toLowerCase()
      );
      
      if (matchingProduct) {
        // Product found in our list, process its variants
        fetchedProduct.node.variants.edges.forEach(fetchedVariant => {
          // Find if this variant is in our hardcoded list
          const matchingVariant = matchingProduct.variants.find(v => 
            v.title.toLowerCase() === (fetchedVariant.node.title || "Default").toLowerCase()
          );
          
          if (matchingVariant) {
            // Calculate new price based on gold price and multiplier
            const newPrice = (goldPrice * matchingVariant.multiplier).toFixed(2);
            
            // Add to list for updating
            productsToUpdate.push({
              variantId: fetchedVariant.node.id,
              oldPrice: fetchedVariant.node.price,
              newPrice: newPrice,
              title: `${fetchedProduct.node.title} - ${fetchedVariant.node.title || "Default"}`,
              multiplier: matchingVariant.multiplier
            });
          }
        });
      }
    });
    
    console.log(`Found ${productsToUpdate.length} products/variants to update`);
    
    // Now update all the products we found
    const updatePromises = productsToUpdate.map(async (product) => {
      try {
        console.log(`Updating ${product.title} from $${product.oldPrice} to $${product.newPrice}`);
        
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
              id: product.variantId,
              price: product.newPrice,
            },
          },
        });
        
        const result = await response.json();
        
        if (result.errors) {
          console.error(`Error updating ${product.title}:`, result.errors);
          return { ...product, success: false, error: result.errors[0]?.message };
        }
        
        if (result.data?.productVariantUpdate?.userErrors?.length > 0) {
          const errors = result.data.productVariantUpdate.userErrors;
          console.error(`Error updating ${product.title}:`, errors);
          return { ...product, success: false, error: errors[0]?.message };
        }
        
        console.log(`Successfully updated ${product.title} to $${product.newPrice}`);
        return { ...product, success: true };
      } catch (error) {
        console.error(`Error updating ${product.title}:`, error);
        return { ...product, success: false, error: error.message };
      }
    });
    
    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);
    
    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    // Generate summary message
    let message;
    if (successCount > 0) {
      message = `Updated ${successCount} products successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`;
    } else if (productsToUpdate.length === 0) {
      message = "No products matched our predefined list. Make sure product names match exactly.";
    } else {
      message = "Failed to update any products. Check server logs for details.";
    }
    
    return json({
      message,
      success: successCount > 0,
      details: results,
      goldPrice
    });
  } catch (error) {
    console.error("Error in action:", error);
    return json({ 
      error: "Error updating prices: " + error.message,
      success: false
    });
  }
}

export default function Index() {
  const { products, authenticated, fetchError } = useLoaderData();
  const [goldPrice, setGoldPrice] = useState("");
  const [updatedProducts, setUpdatedProducts] = useState([]);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Handle form submission with manual handling
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!goldPrice || isNaN(goldPrice) || parseFloat(goldPrice) <= 0) {
      setMessage("Please enter a valid gold price (must be greater than 0)");
      setIsSuccess(false);
      return;
    }
    
    if (!window.confirm("Update all prices based on this gold price?")) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      setMessage("Updating prices...");
      
      // Submit the form data to our action
      const formData = new FormData();
      formData.append("goldPrice", goldPrice);
      
      const response = await fetch("?index", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      setMessage(result.message || (result.success ? "Prices updated successfully" : "Failed to update prices"));
      setIsSuccess(result.success);
      
      if (result.details) {
        setUpdatedProducts(result.details);
      }
    } catch (error) {
      setMessage("Error: " + error.message);
      setIsSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div style={{
      maxWidth: "800px",
      margin: "0 auto",
      padding: "20px",
      fontFamily: "system-ui, sans-serif"
    }}>
      <h1 style={{ marginBottom: "20px" }}>GoldSync Price Editor</h1>
      
      {!authenticated && (
        <div style={{
          padding: "15px",
          backgroundColor: "#f8d7da",
          color: "#721c24",
          borderRadius: "4px",
          marginBottom: "20px"
        }}>
          <strong>Authentication Error:</strong> Please ensure you're logged into Shopify
        </div>
      )}
      
      {fetchError && (
        <div style={{
          padding: "15px",
          backgroundColor: "#fff3cd",
          color: "#856404",
          borderRadius: "4px",
          marginBottom: "20px"
        }}>
          <strong>Warning:</strong> Unable to fetch current products: {fetchError}. You can still update prices, but current prices won't be displayed.
        </div>
      )}
      
      <div style={{ marginBottom: "30px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Gold Price ($ per oz):
            </label>
            <input
              type="number"
              value={goldPrice}
              onChange={(e) => setGoldPrice(e.target.value)}
              placeholder="e.g., 2000"
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "16px",
                borderRadius: "4px",
                border: "1px solid #ccc"
              }}
              step="0.01"
              min="0.01"
              required
            />
            <p style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}>
              Enter the current gold price. All linked products will be updated based on their gold multiplier.
            </p>
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "16px",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? "Updating..." : "Update All Prices"}
          </button>
        </form>
      </div>
      
      {message && (
        <div style={{
          padding: "15px",
          backgroundColor: isSuccess ? "#d4edda" : "#f8d7da",
          color: isSuccess ? "#155724" : "#721c24",
          borderRadius: "4px",
          marginBottom: "20px"
        }}>
          {message}
        </div>
      )}
      
      {updatedProducts.length > 0 && (
        <div style={{ marginBottom: "30px" }}>
          <h2>Updated Products</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd" }}>Product</th>
                  <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid #ddd" }}>Old Price</th>
                  <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid #ddd" }}>New Price</th>
                  <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid #ddd" }}>Multiplier</th>
                  <th style={{ textAlign: "center", padding: "10px", borderBottom: "2px solid #ddd" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {updatedProducts.map((product, index) => (
                  <tr key={index}>
                    <td style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #eee" }}>{product.title}</td>
                    <td style={{ textAlign: "right", padding: "10px", borderBottom: "1px solid #eee" }}>${product.oldPrice}</td>
                    <td style={{ textAlign: "right", padding: "10px", borderBottom: "1px solid #eee" }}>${product.newPrice}</td>
                    <td style={{ textAlign: "right", padding: "10px", borderBottom: "1px solid #eee" }}>{product.multiplier}</td>
                    <td style={{ 
                      textAlign: "center", 
                      padding: "10px", 
                      borderBottom: "1px solid #eee",
                      color: product.success ? "#155724" : "#721c24"
                    }}>
                      {product.success ? "✓" : "✗"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      <div style={{ marginTop: "40px" }}>
        <h2>Current Product Prices</h2>
        {products.length === 0 ? (
          <p>No products available</p>
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
                
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Variant</th>
                      <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #ddd" }}>Current Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map(variant => (
                      <tr key={variant.id}>
                        <td style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #eee" }}>
                          {variant.title}
                        </td>
                        <td style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #eee" }}>
                          ${variant.price}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: "40px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
        <h2>Linked Products</h2>
        <p>The following products are linked to the gold price:</p>
        
        <ul style={{ marginTop: "10px" }}>
          {PRODUCTS.map((product, index) => (
            <li key={index} style={{ marginBottom: "15px" }}>
              <strong>{product.title}</strong>
              <ul style={{ marginTop: "5px" }}>
                {product.variants.map((variant, vIndex) => (
                  <li key={vIndex}>
                    {variant.title}: {variant.multiplier * 100}% of gold price
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        
        <p style={{ marginTop: "15px", fontStyle: "italic", fontSize: "14px" }}>
          Note: Product and variant names must match exactly as they appear in Shopify.
        </p>
      </div>
    </div>
  );
}