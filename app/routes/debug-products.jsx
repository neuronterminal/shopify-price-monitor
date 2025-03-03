// app/routes/debug-products.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    
    // First, get the API version being used
    const versionResponse = await admin.graphql(`
      query {
        shop {
          name
        }
      }
    `);
    const versionData = await versionResponse.headers.get('x-shopify-api-version');
    
    // Now query products with a simpler query
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
    
    return json({
      apiVersion: versionData,
      products: productsData.data.products.edges.map(edge => ({
        title: edge.node.title,
        id: edge.node.id,
        variants: edge.node.variants.edges.map(variantEdge => ({
          title: variantEdge.node.title,
          id: variantEdge.node.id,
          price: variantEdge.node.price
        }))
      }))
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

export default function DebugProducts() {
  const data = useLoaderData();
  
  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Product Debug</h1>
      <p><strong>API Version:</strong> {data.apiVersion || 'Unknown'}</p>
      
      {data.error ? (
        <div style={{ color: "red" }}>
          <h2>Error:</h2>
          <p>{data.error}</p>
          <pre>{data.stack}</pre>
        </div>
      ) : (
        <>
          <h2>Found {data.products.length} products</h2>
          
          {data.products.map(product => (
            <div key={product.id} style={{ marginBottom: "20px", border: "1px solid #ccc", padding: "15px" }}>
              <h3>{product.title}</h3>
              <p><strong>ID:</strong> {product.id}</p>
              
              <h4>Variants ({product.variants.length}):</h4>
              <ul>
                {product.variants.map(variant => (
                  <li key={variant.id}>
                    <strong>{variant.title}:</strong> ${variant.price}
                    <br />
                    <code>ID: {variant.id}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}