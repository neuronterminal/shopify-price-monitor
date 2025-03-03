// app/routes/debug.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    console.log("Debug route called");
    
    // Check if authentication is working
    const authResult = await authenticate.admin(request);
    
    // Only return that auth passed - don't expose session details
    return json({
      status: "success",
      message: "Authentication successful",
      shop: authResult.session.shop,
    });
  } catch (error) {
    console.error("Debug authentication error:", error);
    return json({
      status: "error",
      message: "Authentication failed",
      error: error.message,
    }, { status: 500 });
  }
}

export default function Debug() {
  const data = useLoaderData();
  
  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Debug Page</h1>
      
      <div style={{ 
        padding: "15px", 
        backgroundColor: data.status === "success" ? "#d4edda" : "#f8d7da", 
        borderRadius: "5px",
        marginBottom: "20px"
      }}>
        <h2>Authentication Status: {data.status}</h2>
        <p><strong>Message:</strong> {data.message}</p>
        {data.shop && <p><strong>Shop:</strong> {data.shop}</p>}
        {data.error && <p><strong>Error:</strong> {data.error}</p>}
      </div>
      
      <div>
        <h3>Common Issues:</h3>
        <ul>
          <li>Check that your ngrok URL in shopify.app.toml matches your current tunnel</li>
          <li>Ensure your app is properly installed in the Shopify store</li>
          <li>Verify that your session storage is properly configured</li>
          <li>Check that you have proper permissions set in your access_scopes</li>
        </ul>
      </div>
    </div>
  );
}