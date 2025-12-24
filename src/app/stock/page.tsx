{
  "entities": {
    "UserProfile": {
      "title": "User Profile",
      "type": "object",
      "description": "Represents a user's profile information.",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "description": "The user's email address."
        }
      },
      "required": ["email"]
    },
    "OrderItem": {
      "title": "Order Item",
      "type": "object",
      "description": "Represents an individual item ordered at the restaurant.",
      "properties": {
        "userId": {
          "type": "string",
          "description": "The ID of the user who created the order item."
        },
        "name": {
          "type": "string",
          "description": "The name of the item ordered."
        },
        "price": {
          "type": "number",
          "description": "The price of the item."
        },
        "group": {
          "type": "string",
          "description": "The group the item belongs to."
        },
        "quantity": {
          "type": "number",
          "description": "The quantity of the item ordered."
        },
        "timestamp": {
          "type": "string",
          "format": "date-time",
          "description": "The date and time the item was ordered."
        },
        "total": {
          "type": "number"
        }
      },
      "required": ["userId", "name", "price", "group", "quantity", "timestamp", "total"]
    },
    "FavoriteClient": {
      "title": "Favorite Client",
      "type": "object",
      "description": "Represents a favorite client with a saved command.",
      "properties": {
        "userId": {
          "type": "string",
          "description": "The ID of the user who saved this favorite client."
        },
        "name": {
          "type": "string",
          "description": "The name of the favorite client."
        },
        "command": {
          "type": "string",
          "description": "The saved command for the client's usual order."
        }
      },
      "required": ["userId", "name", "command"]
    },
    "BomboniereItem": {
      "title": "Bomboniere Item",
      "description": "Represents a bomboniere item with stock control.",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "price": { "type": "number" },
        "stock": { "type": "number" }
      },
      "required": ["name", "price", "stock"]
    }
  },
  "auth": {
    "providers": ["password", "anonymous"]
  },
  "firestore": {
    "structure": [
      {
        "path": "/users/{userId}",
        "definition": {
          "entityName": "UserProfile",
          "schema": {
            "$ref": "#/backend/entities/UserProfile"
          },
          "description": "Stores user profile data."
        }
      },
      {
        "path": "/order_items/{orderItemId}",
        "definition": {
          "entityName": "OrderItem",
          "schema": {
            "$ref": "#/backend/entities/OrderItem"
          },
          "description": "Collection of all order items across all users."
        }
      },
      {
        "path": "/favorite_clients/{clientId}",
        "definition": {
          "entityName": "FavoriteClient",
          "schema": {
            "$ref": "#/backend/entities/FavoriteClient"
          },
          "description": "Collection of all favorite clients across all users."
        }
      },
      {
        "path": "/bomboniere_items/{itemId}",
        "definition": {
          "entityName": "BomboniereItem",
          "schema": {
            "$ref": "#/backend/entities/BomboniereItem"
          },
          "description": "Shared list of bomboniere items."
        }
      }
    ]
  }
}