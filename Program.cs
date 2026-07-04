using Microsoft.AspNetCore.Http.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.FileProviders;
using System.Data;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var connectionString = builder.Configuration.GetConnectionString("StockDb")
    ?? "Server=(localdb)\\MSSQLLocalDB;Database=StockDashboardDb;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true";

var app = builder.Build();

await Database.EnsureCreatedAsync(connectionString);

var root = app.Environment.ContentRootPath;
app.UseDefaultFiles(new DefaultFilesOptions
{
    FileProvider = new PhysicalFileProvider(root),
    DefaultFileNames = { "stock-dashboard.html" }
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(root)
});

app.MapGet("/api/products", async () =>
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();

    var products = new List<Product>();
    await using var command = new SqlCommand("""
        SELECT Id, Name, Category, Qty, Threshold, Price
        FROM Products
        ORDER BY Id
        """, connection);

    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        products.Add(Product.FromReader(reader));
    }

    return Results.Ok(products);
});

app.MapPost("/api/products", async (ProductInput input) =>
{
    if (string.IsNullOrWhiteSpace(input.Name))
    {
        return Results.BadRequest(new { message = "Product name is required." });
    }

    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

    var id = await InsertProductAsync(connection, transaction, input);
    var product = await GetProductAsync(connection, transaction, id);
    if (product is null)
    {
        await transaction.RollbackAsync();
        return Results.Problem("The product was created, but could not be read back.");
    }

    await InsertActivityAsync(connection, transaction, "add", $"Produit ajoute: {product.Name}", $"{product.Category}, stock initial {product.Qty} u.");

    await transaction.CommitAsync();
    return Results.Created($"/api/products/{id}", product);
});

app.MapPut("/api/products/{id:int}", async (int id, ProductInput input) =>
{
    if (string.IsNullOrWhiteSpace(input.Name))
    {
        return Results.BadRequest(new { message = "Product name is required." });
    }

    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

    await using var command = new SqlCommand("""
        UPDATE Products
        SET Name = @Name, Category = @Category, Qty = @Qty, Threshold = @Threshold, Price = @Price
        WHERE Id = @Id
        """, connection, transaction);
    AddProductParameters(command, input);
    command.Parameters.AddWithValue("@Id", id);

    var affected = await command.ExecuteNonQueryAsync();
    if (affected == 0)
    {
        await transaction.RollbackAsync();
        return Results.NotFound();
    }

    var product = await GetProductAsync(connection, transaction, id);
    if (product is null)
    {
        await transaction.RollbackAsync();
        return Results.Problem("The product was updated, but could not be read back.");
    }

    await InsertActivityAsync(connection, transaction, "update", $"Produit modifie: {product.Name}", $"{product.Category}, stock {product.Qty} u.");

    await transaction.CommitAsync();
    return Results.Ok(product);
});

app.MapDelete("/api/products/{id:int}", async (int id) =>
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

    var product = await GetProductAsync(connection, transaction, id);
    if (product is null)
    {
        await transaction.RollbackAsync();
        return Results.NotFound();
    }

    await using var command = new SqlCommand("DELETE FROM Products WHERE Id = @Id", connection, transaction);
    command.Parameters.AddWithValue("@Id", id);
    await command.ExecuteNonQueryAsync();

    await InsertActivityAsync(connection, transaction, "delete", $"Produit supprime: {product.Name}", $"{product.Category}, ancien stock {product.Qty} u.");
    await transaction.CommitAsync();
    return Results.NoContent();
});

app.MapPost("/api/movements", async (MovementInput input) =>
{
    if (input.Qty <= 0 || (input.Type != "in" && input.Type != "out"))
    {
        return Results.BadRequest(new { message = "Movement type and quantity are invalid." });
    }

    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable);

    var product = await GetProductAsync(connection, transaction, input.ProductId);
    if (product is null)
    {
        await transaction.RollbackAsync();
        return Results.NotFound();
    }

    var movementQty = input.Type == "out" ? Math.Min(product.Qty, input.Qty) : input.Qty;
    var newQty = input.Type == "out" ? product.Qty - movementQty : product.Qty + movementQty;

    await using var update = new SqlCommand("UPDATE Products SET Qty = @Qty WHERE Id = @Id", connection, transaction);
    update.Parameters.AddWithValue("@Qty", newQty);
    update.Parameters.AddWithValue("@Id", product.Id);
    await update.ExecuteNonQueryAsync();

    var title = input.Type == "out"
        ? $"Sortie -{movementQty}: {product.Name}"
        : $"Entree +{movementQty}: {product.Name}";
    var detail = input.Type == "out"
        ? $"Stock restant {newQty} u."
        : $"Nouveau stock {newQty} u.";

    await InsertActivityAsync(connection, transaction, input.Type, title, detail);
    await transaction.CommitAsync();

    var updated = product with { Qty = newQty };
    return Results.Ok(updated);
});

app.MapGet("/api/activities", async () =>
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();

    var activities = new List<ActivityItem>();
    await using var command = new SqlCommand("""
        SELECT TOP (40) Type, Title, Detail, CreatedAt
        FROM Activities
        ORDER BY Id DESC
        """, connection);

    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        activities.Add(new ActivityItem(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetDateTime(3)));
    }

    return Results.Ok(activities);
});

app.MapGet("/", () => Results.Redirect("/stock-dashboard.html"));

app.Run();

static async Task<int> InsertProductAsync(SqlConnection connection, SqlTransaction transaction, ProductInput input)
{
    await using var command = new SqlCommand("""
        INSERT INTO Products (Name, Category, Qty, Threshold, Price)
        OUTPUT INSERTED.Id
        VALUES (@Name, @Category, @Qty, @Threshold, @Price)
        """, connection, transaction);
    AddProductParameters(command, input);
    var result = await command.ExecuteScalarAsync();
    if (result is not int id)
    {
        throw new InvalidOperationException("The product insert did not return an id.");
    }

    return id;
}

static async Task<Product?> GetProductAsync(SqlConnection connection, SqlTransaction transaction, int id)
{
    await using var command = new SqlCommand("""
        SELECT Id, Name, Category, Qty, Threshold, Price
        FROM Products
        WHERE Id = @Id
        """, connection, transaction);
    command.Parameters.AddWithValue("@Id", id);

    await using var reader = await command.ExecuteReaderAsync();
    return await reader.ReadAsync() ? Product.FromReader(reader) : null;
}

static async Task InsertActivityAsync(SqlConnection connection, SqlTransaction transaction, string type, string title, string detail)
{
    await using var command = new SqlCommand("""
        INSERT INTO Activities (Type, Title, Detail)
        VALUES (@Type, @Title, @Detail)
        """, connection, transaction);
    command.Parameters.AddWithValue("@Type", type);
    command.Parameters.AddWithValue("@Title", title);
    command.Parameters.AddWithValue("@Detail", detail);
    await command.ExecuteNonQueryAsync();
}

static void AddProductParameters(SqlCommand command, ProductInput input)
{
    command.Parameters.AddWithValue("@Name", input.Name.Trim());
    command.Parameters.AddWithValue("@Category", input.Category.Trim());
    command.Parameters.AddWithValue("@Qty", input.Qty);
    command.Parameters.AddWithValue("@Threshold", input.Threshold);
    command.Parameters.AddWithValue("@Price", input.Price);
}

public record Product(int Id, string Name, string Category, int Qty, int Threshold, decimal Price)
{
    public static Product FromReader(SqlDataReader reader) => new(
        reader.GetInt32(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetInt32(3),
        reader.GetInt32(4),
        reader.GetDecimal(5));
}

public record ProductInput(string Name, string Category, int Qty, int Threshold, decimal Price);
public record MovementInput(int ProductId, string Type, int Qty);
public record ActivityItem(string Type, string Title, string Detail, DateTime CreatedAt);

internal static class Database
{
    public static async Task EnsureCreatedAsync(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        var databaseName = builder.InitialCatalog;
        builder.InitialCatalog = "master";

        await using (var master = new SqlConnection(builder.ConnectionString))
        {
            await master.OpenAsync();
            await using var create = new SqlCommand($"""
                IF DB_ID(@DatabaseName) IS NULL
                BEGIN
                    DECLARE @Sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@DatabaseName);
                    EXEC sp_executesql @Sql;
                END
                """, master);
            create.Parameters.AddWithValue("@DatabaseName", databaseName);
            await create.ExecuteNonQueryAsync();
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var schema = new SqlCommand("""
            IF OBJECT_ID('dbo.Products', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.Products
                (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    Name nvarchar(160) NOT NULL,
                    Category nvarchar(80) NOT NULL,
                    Qty int NOT NULL,
                    Threshold int NOT NULL,
                    Price decimal(18,2) NOT NULL,
                    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME()
                );
            END;

            IF OBJECT_ID('dbo.Activities', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.Activities
                (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    Type nvarchar(20) NOT NULL,
                    Title nvarchar(220) NOT NULL,
                    Detail nvarchar(220) NOT NULL,
                    CreatedAt datetime2 NOT NULL CONSTRAINT DF_Activities_CreatedAt DEFAULT SYSUTCDATETIME()
                );
            END;
            """, connection);
        await schema.ExecuteNonQueryAsync();
    }
}
