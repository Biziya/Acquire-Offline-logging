using BackendApi.Data;
using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using BackendApi.Repositories.TableConstants;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Authentication.Negotiate;

const string CorsPolicy = "FrontendCors";

var builder = WebApplication.CreateBuilder(args);

// ============================================
// 1. Controllers and Swagger
// ============================================

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ============================================
// 2. Database Repositories
// ============================================

builder.Services.AddScoped<
    IDrillholeRepository,
    DrillholeRepository>();

builder.Services.AddScoped<
    ITableConstantsRepository,
    TableConstantsRepository>();

builder.Services.AddScoped<
    IUploadDataRepository,
    UploadDataRepository>();

builder.Services.AddScoped<
    IDataViewerRepository,
    DataViewerRepository>();

// ============================================
// 3. Windows Authentication
// ============================================

builder.Services
    .AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddAuthorization();

// ============================================
// 4. CORS Configuration
// ============================================

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy
            .WithOrigins("http://10.27.27.140:5174")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// ============================================
// 5. Build Application
// ============================================

var app = builder.Build();

// Which login Upload Data and Data Viewer will use (no password is logged).
// Under IIS, Windows authentication means the computer account, e.g.
// BDOM\BMNDULAAS01$, which has no SQL login (error 18456).
try
{
    app.Logger.LogInformation(
        "Environment {Environment}; CoreDescrData connection: {Connection}",
        app.Environment.EnvironmentName,
        BackendApi.Data.ConfigurationExtensions.DescribeConnection(app.Configuration.GetCoreDescrDataConnectionString()));
}
catch (Exception exception) when (exception is InvalidOperationException or ArgumentException)
{
    app.Logger.LogError(exception, "The CoreDescrData connection string is missing or invalid.");
}

// ============================================
// 6. Swagger
// ============================================

app.UseSwagger();
app.UseSwaggerUI();

// ============================================
// 7. HTTPS (Local Development Only)
// ============================================

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// ============================================
// 8. Middleware
// ============================================

app.UseRouting();

app.UseCors(CorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

// ============================================
// 9. API Routes
// ============================================

app.MapControllers();

// ============================================
// 10. Run Application
// ============================================

app.Run();