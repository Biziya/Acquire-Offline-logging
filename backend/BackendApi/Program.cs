using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using BackendApi.Repositories.TableConstants;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Authentication.Negotiate;

const string CorsPolicy = "FrontendCors";

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// One repository per API that reads or writes the database (Status has none).
builder.Services.AddScoped<IDrillholeRepository, DrillholeRepository>();
builder.Services.AddScoped<ITableConstantsRepository, TableConstantsRepository>();
builder.Services.AddScoped<IUploadDataRepository, UploadDataRepository>();
builder.Services.AddScoped<IDataViewerRepository, DataViewerRepository>();

// Windows Integrated Authentication, used only by GET /api/status?includeUser=true
// to return the verified Windows user. Nothing requires it: every endpoint
// stays anonymous.
builder.Services
    .AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors(CorsPolicy);

app.UseAuthentication();

app.MapControllers();

app.Run();
