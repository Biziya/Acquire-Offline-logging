
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

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// ============================================
// 5. Build Application
// ============================================

var app = builder.Build();

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
