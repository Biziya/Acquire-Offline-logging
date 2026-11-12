using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using BackendApi.Repositories.TableConstants;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;

const string CorsPolicy = "FrontendCors";

var builder = WebApplication.CreateBuilder(args);

// ============================================
// Controllers and Swagger
// ============================================

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ============================================
// Database Repositories
// ============================================

// Opens every SQL connection; runs it as the request's Windows user when
// Database:ImpersonateWindowsUser is on.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<
    IDatabaseConnectionFactory,
    DatabaseConnectionFactory>();

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
// Windows Authentication
// ============================================

builder.Services
    .AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddAuthorization();

// Every endpoint not marked [AllowAnonymous] (status) needs a Windows user when
// database calls run as that user, or when Auth:AllowedGroup limits the website
// to one AD group: anonymous calls get 401 + WWW-Authenticate: Negotiate, and
// a signed-in user outside the group gets 403. Read when the options are
// built, so test settings apply.
builder.Services
    .AddOptions<AuthorizationOptions>()
    .Configure<IConfiguration>((options, configuration) =>
    {
        var allowedGroup = configuration.GetAllowedGroup();

        if (!configuration.ImpersonatesWindowsUser() && allowedGroup is null)
        {
            return;
        }

        var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser();

        if (allowedGroup is not null)
        {
            policy.RequireAssertion(context => AllowedGroupAccess.IsAllowed(context.User, allowedGroup));
        }

        options.FallbackPolicy = policy.Build();
    });

// ============================================
// CORS Configuration
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
// Build Application
// ============================================

var app = builder.Build();

// Which login Upload Data and Data Viewer will use (no password is logged).
// Under IIS, Windows authentication means the computer account, e.g.
// BDOM\BMNDULAAS01$, which has no SQL login (error 18456).
try
{
    app.Logger.LogInformation(
        "Environment {Environment}; CoreDescrData connection: {Connection}; run as Windows user: {Impersonate}",
        app.Environment.EnvironmentName,
        BackendApi.Data.ConfigurationExtensions.DescribeConnection(app.Configuration.GetCoreDescrDataConnectionString()),
        app.Configuration.ImpersonatesWindowsUser());
}
catch (Exception exception) when (exception is InvalidOperationException or ArgumentException)
{
    app.Logger.LogError(exception, "The CoreDescrData connection string is missing or invalid.");
}

// Website access by AD group. Blank is fine for local development, but outside
// it every Windows user could use the website.
var allowedGroup = app.Configuration.GetAllowedGroup();

if (allowedGroup is not null)
{
    app.Logger.LogInformation("Website access limited to AD group {AllowedGroup}", allowedGroup);
}
else if (app.Environment.IsDevelopment())
{
    app.Logger.LogWarning("{Key} is not set: AD group access check is off.", BackendApi.Data.ConfigurationExtensions.AllowedGroupKey);
}
else
{
    app.Logger.LogError(
        "{Key} is not set: AD group access check is OFF, so any user can use the website. Set it to the allowed group, e.g. BDOM\\AcQuire_Uploaders.",
        BackendApi.Data.ConfigurationExtensions.AllowedGroupKey);
}

// ============================================
// Swagger
// ============================================

app.UseSwagger();
app.UseSwaggerUI();

// ============================================
// HTTPS (Local Development Only)
// ============================================

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// ============================================
// Middleware
// ============================================

app.UseRouting();

app.UseCors(CorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

// ============================================
// API Routes
// ============================================

app.MapControllers();

// ============================================
// Run Application
// ============================================

app.Run();