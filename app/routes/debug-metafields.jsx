// app/routes/debug-metafields.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    
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
                    metafields(first: 20) {
                      edges {
                        node {
                          id
                          namespace
                          key
                          value
                          type
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
    
    const productsResponse = await admin.graphql(productsQuery);
    const productsData = await productsResponse.json();
    
    return json({
      success: true,
      products: productsData.data.products.edges.map(edge => ({
        title: edge.node.title,
        id: edge.node.id,
        variants: edge.node.variants.edges.map(variantEdge => ({
          title: variantEdge.node.title,
          id: variantEdge.node.id,
          price: variantEdge.node.price,
          metafields: variantEdge.node.metafields.edges.map(metafieldEdge => ({
            namespace: metafieldEdge.node.namespace,
            key: metafieldEdge.node.key,
            value: metafieldEdge.node.value,
            type: metafieldEdge.node.type
          }))
        }))
      }))
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    });
  }
}

export default function DebugMetafields() {
  const data = useLoaderData();
  
  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Product and Metafields Debug</h1>
      
      {data.products.map(product => (
        <div key={product.id} style={{ marginBottom: "30px", border: "1px solid #ccc", padding: "15px", borderRadius: "5px" }}>
          <h2>{product.title}</h2>
          <p><strong>ID:</strong> {product.id}</p>
          
          <h3>Variants:</h3>
          {product.variants.map(variant => (
            <div key={variant.id} style={{ marginBottom: "15px", backgroundColor: "#f5f5f5", padding: "10px", borderRadius: "5px" }}>
              <p><strong>Variant:</strong> {variant.title}</p>
              <p><strong>ID:</strong> {variant.id}</p>
              <p><strong>Price:</strong> ${variant.price}</p>
              
              <h4>Metafields:</h4>
              {variant.metafields.length === 0 ? (
                <p>No metafields found for this variant</p>
              ) : (
                <ul>
                  {variant.metafields.map((metafield, index) => (
                    <li key={index}>
                      <strong>{metafield.namespace}.{metafield.key}:</strong> {metafield.value} (Type: {metafield.type})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}