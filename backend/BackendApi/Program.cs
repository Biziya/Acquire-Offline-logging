using BackendApi.Repositories.RawLithoPage.CaCode;
using BackendApi.Repositories.RawLithoPage.ColourCode;
using BackendApi.Repositories.RawLithoPage.Drillhole;
using BackendApi.Repositories.RawLithoPage.LithoCode;
using BackendApi.Repositories.RawLithoPage.OmCode;
using BackendApi.Repositories.RawLithoPage.OmFaciesCode;
using BackendApi.Repositories.RawLithoPage.OxCode;
using BackendApi.Repositories.RawLithoPage.PyCode;
using BackendApi.Repositories.RawLithoPage.RedoxCode;
using BackendApi.Repositories.RawLithoPage.SedimCode;
using BackendApi.Repositories.UploadData;

const string CorsPolicy = "FrontendCors";

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Raw Litho page repositories.
builder.Services.AddScoped<IDrillholeRepository, DrillholeRepository>();
builder.Services.AddScoped<ILithoCodeRepository, LithoCodeRepository>();
builder.Services.AddScoped<IColourRepository, ColourRepository>();
builder.Services.AddScoped<ICaRepository, CaRepository>();
builder.Services.AddScoped<IOmRepository, OmRepository>();
builder.Services.AddScoped<IOmFaciesRepository, OmFaciesRepository>();
builder.Services.AddScoped<IPyRepository, PyRepository>();
builder.Services.AddScoped<IOxRepository, OxRepository>();
builder.Services.AddScoped<ISedimRepository, SedimRepository>();
builder.Services.AddScoped<IRedoxCodeRepository, RedoxCodeRepository>();

// Upload page repositories.
builder.Services.AddScoped<IUploadDataRepository, UploadDataRepository>();

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

app.MapControllers();

app.Run();
